import { createHash, randomBytes } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type {
  ProviderConversionCatalogDto,
  ProviderConversionCatalogInputDto,
  ProviderConversionEndpointDto,
  ProviderConversionEndpointSecretResultDto,
  ProviderConversionRuleAdaptInputDto,
  ProviderConversionRuleCreateInputDto,
  ProviderConversionRuleCreateResultDto,
  ProviderConversionRuleDto,
  ProviderConversionRuleUpdateInputDto,
} from "@wpptrack/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { RUNTIME_ENV, type RuntimeEnv } from "../common/runtime/runtime.module";
import { parseInboundWebhooksConfig } from "../config/deployment-config";

const ruleNotFoundMessage = "Regra de conversao do provedor nao encontrada";
const connectionNotFoundMessage = "Conexao Umbler nao encontrada";
const endpointNotFoundMessage = "Endpoint de automacao nao encontrado";

const providerRuleInclude = {
  conversionRule: true,
  connection: true,
  parserRelease: true,
  channels: {
    orderBy: { createdAt: "asc" },
  },
  endpoint: true,
  catalog: {
    include: {
      attributes: {
        orderBy: { position: "asc" },
      },
      variants: {
        orderBy: { createdAt: "asc" },
      },
    },
  },
  executions: {
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    take: 1,
  },
} satisfies Prisma.ProviderConversionRuleConfigInclude;

type PersistedProviderRule = Prisma.ProviderConversionRuleConfigGetPayload<{
  include: typeof providerRuleInclude;
}>;

@Injectable()
export class ProviderConversionRulesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RUNTIME_ENV) private readonly env: RuntimeEnv = process.env,
  ) {}

  async listRules(workspaceId: string): Promise<ProviderConversionRuleDto[]> {
    this.requireRulesEnabled();
    const rules = await this.prisma.providerConversionRuleConfig.findMany({
      where: {
        workspaceId,
        removedAt: null,
      },
      include: providerRuleInclude,
      orderBy: { createdAt: "desc" },
    });

    return rules.map((rule) => this.toDto(rule));
  }

  async createRule(
    workspaceId: string,
    input: ProviderConversionRuleCreateInputDto,
    actorUserId: string,
  ): Promise<ProviderConversionRuleCreateResultDto> {
    const config = this.requireRulesEnabled();
    this.assertUniqueCatalogVariants(input);
    const secret =
      input.triggerType === "provider_automation"
        ? this.generateSecret()
        : null;

    const created = await this.prisma.$transaction(async (transaction) => {
      const connection = await transaction.inboundWebhookConnection.findFirst({
        where: {
          id: input.connectionId,
          workspaceId,
          provider: "umbler",
          removedAt: null,
        },
        include: { parserRelease: true },
      });

      if (!connection) {
        throw new NotFoundException(connectionNotFoundMessage);
      }

      await this.assertChannelsBelongToConnection(
        transaction,
        workspaceId,
        connection.id,
        input.channelIds,
      );

      const parserRelease =
        input.triggerType === "provider_automation"
          ? await transaction.inboundWebhookParserRelease.findFirst({
              where: {
                provider: "umbler",
                version: "automation-v1",
                status: { not: "retired" },
              },
            })
          : connection.parserRelease;

      if (!parserRelease) {
        throw new ConflictException(
          "Parser de automacao Umbler ainda nao esta disponivel",
        );
      }

      if (
        input.mode === "production" &&
        input.triggerType === "provider_automation"
      ) {
        throw new ConflictException(
          "Automacoes por tag permanecem em observacao ate a certificacao do payload real",
        );
      }

      this.assertModeAllowed(input.mode, parserRelease.status);
      let defaultValueCents: number | null = null;
      let defaultCurrency: string | null = null;
      let defaultContentName: string | null = null;

      if (
        input.triggerType === "message_phrase" ||
        (input.triggerType === "provider_automation" &&
          input.eventName === "Purchase")
      ) {
        defaultValueCents = input.defaultValueCents;
        defaultCurrency = input.defaultCurrency;
        defaultContentName = input.defaultContentName ?? null;
      } else if (input.triggerType === "structured_catalog") {
        defaultCurrency = input.catalog.currency;
        defaultContentName = input.catalog.productName;
      }

      const conversionRule = await transaction.conversionRule.create({
        data: {
          workspaceId,
          name: input.name,
          triggerType: input.triggerType,
          triggerValue:
            input.triggerType === "provider_automation"
              ? input.triggerType
              : input.triggerPhrases[0],
          matchMode: "exact",
          eventName: input.eventName,
          pixelId: null,
          defaultValueCents,
          defaultCurrency,
          defaultContentName,
          defaultItems: Prisma.DbNull,
          active: true,
        },
      });

      const providerRule =
        await transaction.providerConversionRuleConfig.create({
          data: {
            workspaceId,
            conversionRuleId: conversionRule.id,
            connectionId: connection.id,
            parserReleaseId: parserRelease.id,
            mode: input.mode,
            messageTriggerPhrases:
              input.triggerType === "provider_automation"
                ? []
                : input.triggerPhrases,
            messageAuthorScope:
              input.triggerType === "provider_automation"
                ? null
                : input.messageAuthorScope,
            productionActivatedAt:
              input.mode === "production" ? new Date() : null,
            createdByUserId: actorUserId,
          },
        });

      await transaction.providerConversionRuleChannel.createMany({
        data: input.channelIds.map((channelId) => ({
          workspaceId,
          providerRuleId: providerRule.id,
          channelId,
        })),
      });

      if (secret) {
        await transaction.providerConversionRuleEndpoint.create({
          data: {
            workspaceId,
            providerRuleId: providerRule.id,
            secretHash: this.hashSecret(secret),
          },
        });
      }

      if (input.triggerType === "structured_catalog") {
        await this.createCatalog(
          transaction,
          workspaceId,
          providerRule.id,
          input.catalog,
        );
      }

      await this.createAudit(transaction, {
        workspaceId,
        actorUserId,
        action: "provider_conversion_rule.created",
        targetId: providerRule.id,
        resultStatus: input.mode,
        afterSummary: {
          eventName: input.eventName,
          triggerType: input.triggerType,
          connectionId: connection.id,
          channelCount: input.channelIds.length,
          mode: input.mode,
          endpointCreated: Boolean(secret),
        },
      });

      return this.requireRule(transaction, workspaceId, providerRule.id);
    });

    return {
      rule: this.toDto(created),
      webhookUrl:
        secret && created.endpoint
          ? this.buildWebhookUrl(
              config.apiPublicUrl,
              created.endpoint.id,
              secret,
            )
          : null,
    };
  }

  async adaptLegacyMessageRule(
    workspaceId: string,
    legacyRuleId: string,
    input: ProviderConversionRuleAdaptInputDto,
    actorUserId: string,
  ): Promise<ProviderConversionRuleDto> {
    this.requireRulesEnabled();

    const adapted = await this.prisma.$transaction(async (transaction) => {
      const legacyRule = await transaction.conversionRule.findFirst({
        where: {
          id: legacyRuleId,
          workspaceId,
        },
        include: {
          providerConfig: true,
        },
      });

      if (!legacyRule) {
        throw new NotFoundException("Regra de conversao nao encontrada");
      }
      if (legacyRule.providerConfig) {
        throw new ConflictException(
          "Esta regra ja esta vinculada a um provedor",
        );
      }
      if (
        legacyRule.triggerType !== "keyword" ||
        legacyRule.eventName !== "Purchase"
      ) {
        throw new ConflictException(
          "Somente regras antigas de compra por palavra-chave podem ser adaptadas",
        );
      }
      if (
        !legacyRule.defaultValueCents ||
        legacyRule.defaultValueCents <= 0 ||
        !legacyRule.defaultCurrency
      ) {
        throw new ConflictException(
          "Configure produto, valor e moeda antes de adaptar esta regra",
        );
      }

      const connection = await transaction.inboundWebhookConnection.findFirst({
        where: {
          id: input.connectionId,
          workspaceId,
          provider: "umbler",
          removedAt: null,
        },
        include: { parserRelease: true },
      });

      if (!connection) {
        throw new NotFoundException(connectionNotFoundMessage);
      }

      await this.assertChannelsBelongToConnection(
        transaction,
        workspaceId,
        connection.id,
        input.channelIds,
      );

      if (!connection.parserRelease) {
        throw new ConflictException("Parser Umbler ainda nao esta disponivel");
      }
      this.assertModeAllowed("observation", connection.parserRelease.status);

      await transaction.conversionRule.update({
        where: { id: legacyRule.id },
        data: {
          triggerType: "message_phrase",
          triggerValue: input.triggerPhrases[0],
          matchMode: "contains",
          active: true,
        },
      });

      const providerRule =
        await transaction.providerConversionRuleConfig.create({
          data: {
            workspaceId,
            conversionRuleId: legacyRule.id,
            connectionId: connection.id,
            parserReleaseId: connection.parserRelease.id,
            mode: "observation",
            messageTriggerPhrases: input.triggerPhrases,
            messageAuthorScope: input.messageAuthorScope,
            productionActivatedAt: null,
            createdByUserId: actorUserId,
          },
        });

      await transaction.providerConversionRuleChannel.createMany({
        data: input.channelIds.map((channelId) => ({
          workspaceId,
          providerRuleId: providerRule.id,
          channelId,
        })),
      });

      await this.createAudit(transaction, {
        workspaceId,
        actorUserId,
        action: "provider_conversion_rule.adapted",
        targetId: providerRule.id,
        resultStatus: "observation",
        afterSummary: {
          conversionRuleId: legacyRule.id,
          previousTriggerType: legacyRule.triggerType,
          previousMatchMode: legacyRule.matchMode,
          eventName: legacyRule.eventName,
          connectionId: connection.id,
          channelCount: input.channelIds.length,
          mode: "observation",
        },
      });

      return this.requireRule(transaction, workspaceId, providerRule.id);
    });

    return this.toDto(adapted);
  }

  async updateRule(
    workspaceId: string,
    providerRuleId: string,
    input: ProviderConversionRuleUpdateInputDto,
    actorUserId: string,
  ): Promise<ProviderConversionRuleDto> {
    this.requireRulesEnabled();
    if (input.catalog) {
      this.assertUniqueCatalogVariants({
        triggerType: "structured_catalog",
        catalog: input.catalog,
      });
    }

    const updated = await this.prisma.$transaction(async (transaction) => {
      const current = await this.requireRule(
        transaction,
        workspaceId,
        providerRuleId,
      );

      this.assertUpdateMatchesRule(current, input);

      if (input.channelIds) {
        await this.assertChannelsBelongToConnection(
          transaction,
          workspaceId,
          current.connectionId,
          input.channelIds,
        );
      }

      const nextMode = input.active === false ? "observation" : input.mode;
      if (nextMode === "production") {
        if (current.conversionRule.triggerType === "provider_automation") {
          throw new ConflictException(
            "Automacoes por tag permanecem em observacao ate a certificacao do payload real",
          );
        }
        this.assertModeAllowed("production", current.parserRelease.status);
      }

      const conversionRuleData: Prisma.ConversionRuleUpdateInput = {};
      if (input.name !== undefined) conversionRuleData.name = input.name;
      if (input.active !== undefined) conversionRuleData.active = input.active;
      if (input.defaultValueCents !== undefined) {
        conversionRuleData.defaultValueCents = input.defaultValueCents;
      }
      if (input.defaultCurrency !== undefined) {
        conversionRuleData.defaultCurrency = input.defaultCurrency;
      }
      if (input.defaultContentName !== undefined) {
        conversionRuleData.defaultContentName = input.defaultContentName;
      }
      if (input.triggerPhrases !== undefined) {
        conversionRuleData.triggerValue = input.triggerPhrases[0];
      }

      if (Object.keys(conversionRuleData).length > 0) {
        await transaction.conversionRule.update({
          where: { id: current.conversionRuleId },
          data: conversionRuleData,
        });
      }

      if (
        input.mode !== undefined ||
        input.active === false ||
        input.triggerPhrases !== undefined ||
        input.messageAuthorScope !== undefined
      ) {
        const mode = nextMode ?? current.mode;
        await transaction.providerConversionRuleConfig.update({
          where: { id: current.id },
          data: {
            mode,
            ...(input.triggerPhrases !== undefined
              ? { messageTriggerPhrases: input.triggerPhrases }
              : {}),
            ...(input.messageAuthorScope !== undefined
              ? { messageAuthorScope: input.messageAuthorScope }
              : {}),
            productionActivatedAt:
              mode === "production"
                ? (current.productionActivatedAt ?? new Date())
                : null,
          },
        });
      }

      if (input.channelIds) {
        await transaction.providerConversionRuleChannel.deleteMany({
          where: { workspaceId, providerRuleId },
        });
        await transaction.providerConversionRuleChannel.createMany({
          data: input.channelIds.map((channelId) => ({
            workspaceId,
            providerRuleId,
            channelId,
          })),
        });
      }

      if (input.catalog) {
        const currentCatalog = current.catalog;
        const aliasUpdates = currentCatalog
          ? this.catalogAliasUpdates(currentCatalog, input.catalog)
          : null;

        if (aliasUpdates && currentCatalog) {
          for (const update of aliasUpdates) {
            const result =
              await transaction.conversionCatalogVariant.updateMany({
                where: {
                  id: update.id,
                  workspaceId,
                  catalogId: currentCatalog.id,
                },
                data: {
                  aliases: update.aliases as Prisma.InputJsonValue,
                },
              });
            if (result.count !== 1) {
              throw new ConflictException(
                "Uma variante do catalogo mudou durante a atualizacao",
              );
            }
          }
        } else {
          const executions =
            await transaction.providerConversionRuleExecution.count({
              where: { workspaceId, providerRuleId },
            });
          if (executions > 0) {
            throw new ConflictException(
              "O catalogo com historico aceita apenas alteracoes de aliases",
            );
          }
          await this.replaceCatalog(
            transaction,
            workspaceId,
            providerRuleId,
            input.catalog,
          );
        }
      }

      const result = await this.requireRule(
        transaction,
        workspaceId,
        providerRuleId,
      );
      await this.createAudit(transaction, {
        workspaceId,
        actorUserId,
        action:
          input.active === false
            ? "provider_conversion_rule.paused"
            : input.mode === "production"
              ? "provider_conversion_rule.activated"
              : "provider_conversion_rule.updated",
        targetId: result.id,
        resultStatus: result.conversionRule.active ? result.mode : "paused",
        afterSummary: this.auditSummary(result),
      });

      return result;
    });

    return this.toDto(updated);
  }

  async rotateEndpoint(
    workspaceId: string,
    providerRuleId: string,
    actorUserId: string,
  ): Promise<ProviderConversionEndpointSecretResultDto> {
    const config = this.requireRulesEnabled();
    const secret = this.generateSecret();

    const endpoint = await this.prisma.$transaction(async (transaction) => {
      const rule = await this.requireRule(
        transaction,
        workspaceId,
        providerRuleId,
      );

      if (
        rule.conversionRule.triggerType !== "provider_automation" ||
        !rule.endpoint
      ) {
        throw new NotFoundException(endpointNotFoundMessage);
      }

      const rotatedAt = new Date();
      const updated = await transaction.providerConversionRuleEndpoint.update({
        where: { id: rule.endpoint.id },
        data: {
          secretHash: this.hashSecret(secret),
          secretVersion: { increment: 1 },
          rotatedAt,
          removedAt: null,
        },
      });

      await this.createAudit(transaction, {
        workspaceId,
        actorUserId,
        action: "provider_conversion_rule.endpoint_rotated",
        targetId: rule.id,
        resultStatus: rule.mode,
        afterSummary: {
          ...this.auditSummary(rule),
          endpointSecretVersion: updated.secretVersion,
        },
      });

      return updated;
    });

    return {
      endpoint: this.endpointToDto(endpoint),
      webhookUrl: this.buildWebhookUrl(
        config.apiPublicUrl,
        endpoint.id,
        secret,
      ),
    };
  }

  async removeRule(
    workspaceId: string,
    providerRuleId: string,
    actorUserId: string,
  ): Promise<void> {
    this.requireRulesEnabled();

    await this.prisma.$transaction(async (transaction) => {
      const current = await this.requireRule(
        transaction,
        workspaceId,
        providerRuleId,
      );
      const removedAt = new Date();

      await transaction.conversionRule.update({
        where: { id: current.conversionRuleId },
        data: { active: false },
      });
      await transaction.providerConversionRuleConfig.update({
        where: { id: current.id },
        data: {
          mode: "observation",
          productionActivatedAt: null,
          removedAt,
        },
      });
      await transaction.providerConversionRuleEndpoint.updateMany({
        where: { workspaceId, providerRuleId },
        data: { removedAt },
      });

      await this.createAudit(transaction, {
        workspaceId,
        actorUserId,
        action: "provider_conversion_rule.removed",
        targetId: current.id,
        resultStatus: "removed",
        afterSummary: {
          ...this.auditSummary(current),
          removed: true,
        },
      });
    });
  }

  private requireRulesEnabled() {
    const config = parseInboundWebhooksConfig(this.env);

    if (!config.enabled || !config.conversionRulesEnabled) {
      throw new ServiceUnavailableException(
        "Eventos de conversao por provedor ainda nao estao habilitados",
      );
    }

    return config;
  }

  private assertModeAllowed(
    mode: "observation" | "production",
    parserStatus: "observation_only" | "certified" | "retired",
  ): void {
    if (mode !== "production") return;
    const config = this.requireRulesEnabled();

    if (!config.conversionProductionEnabled) {
      throw new ServiceUnavailableException(
        "Materializacao de conversoes por provedor ainda nao esta habilitada",
      );
    }
    if (parserStatus !== "certified") {
      throw new ConflictException(
        "Certifique o parser antes de ativar esta regra em producao",
      );
    }
  }

  private async assertChannelsBelongToConnection(
    transaction: Prisma.TransactionClient,
    workspaceId: string,
    connectionId: string,
    channelIds: string[],
  ): Promise<void> {
    const uniqueIds = [...new Set(channelIds)];
    const count = await transaction.inboundWebhookChannel.count({
      where: {
        workspaceId,
        connectionId,
        id: { in: uniqueIds },
      },
    });

    if (count !== uniqueIds.length || uniqueIds.length !== channelIds.length) {
      throw new BadRequestException(
        "Um ou mais canais nao pertencem a esta conexao e workspace",
      );
    }
  }

  private assertUpdateMatchesRule(
    current: PersistedProviderRule,
    input: ProviderConversionRuleUpdateInputDto,
  ): void {
    const isFixedPurchase =
      ["provider_automation", "message_phrase"].includes(
        current.conversionRule.triggerType,
      ) && current.conversionRule.eventName === "Purchase";
    const hasValueUpdate =
      input.defaultValueCents !== undefined ||
      input.defaultCurrency !== undefined ||
      input.defaultContentName !== undefined;

    if (hasValueUpdate && !isFixedPurchase) {
      throw new BadRequestException(
        "Valores padrao pertencem apenas a regras de compra com valor fixo",
      );
    }
    if (isFixedPurchase && input.defaultValueCents === null) {
      throw new BadRequestException(
        "Regras de compra com valor fixo precisam manter um valor positivo",
      );
    }
    if (
      input.catalog &&
      current.conversionRule.triggerType !== "structured_catalog"
    ) {
      throw new BadRequestException(
        "Catalogos pertencem apenas a regras de compra estruturada",
      );
    }
    const isMessageRule = ["message_phrase", "structured_catalog"].includes(
      current.conversionRule.triggerType,
    );
    if (
      (input.triggerPhrases !== undefined ||
        input.messageAuthorScope !== undefined) &&
      !isMessageRule
    ) {
      throw new BadRequestException(
        "Frases gatilho pertencem apenas a regras baseadas em mensagem",
      );
    }
    if (
      input.mode === "production" &&
      (input.active === false || !current.conversionRule.active)
    ) {
      throw new ConflictException(
        "Ative a regra antes de promover para producao",
      );
    }
  }

  private assertUniqueCatalogVariants(input: {
    triggerType: string;
    catalog?: ProviderConversionCatalogInputDto;
  }): void {
    if (input.triggerType !== "structured_catalog" || !input.catalog) return;
    const keys = input.catalog.variants.map((variant) =>
      this.catalogVariantKey(variant.attributeValues),
    );

    if (new Set(keys).size !== keys.length) {
      throw new BadRequestException(
        "Cada combinacao de atributos do catalogo deve ser unica",
      );
    }
  }

  private async createCatalog(
    transaction: Prisma.TransactionClient,
    workspaceId: string,
    providerRuleId: string,
    catalog: ProviderConversionCatalogInputDto,
  ): Promise<void> {
    const created = await transaction.conversionCatalog.create({
      data: {
        workspaceId,
        providerRuleId,
        name: catalog.name,
        productName: catalog.productName,
        currency: catalog.currency,
      },
    });

    await transaction.conversionCatalogAttribute.createMany({
      data: catalog.attributes.map((attribute, index) => ({
        workspaceId,
        catalogId: created.id,
        position: index + 1,
        key: attribute.key,
        label: attribute.label,
      })),
    });
    await transaction.conversionCatalogVariant.createMany({
      data: catalog.variants.map((variant) => ({
        workspaceId,
        catalogId: created.id,
        normalizedKey: this.catalogVariantKey(variant.attributeValues),
        attributeValues: variant.attributeValues as Prisma.InputJsonValue,
        aliases: variant.aliases as Prisma.InputJsonValue,
        valueCents: variant.valueCents,
        contentName: variant.contentName ?? null,
      })),
    });
  }

  private async replaceCatalog(
    transaction: Prisma.TransactionClient,
    workspaceId: string,
    providerRuleId: string,
    catalog: ProviderConversionCatalogInputDto,
  ): Promise<void> {
    const current = await transaction.conversionCatalog.findFirst({
      where: { workspaceId, providerRuleId },
      select: { id: true },
    });

    if (!current) {
      await this.createCatalog(
        transaction,
        workspaceId,
        providerRuleId,
        catalog,
      );
      return;
    }

    await transaction.conversionCatalogVariant.deleteMany({
      where: { workspaceId, catalogId: current.id },
    });
    await transaction.conversionCatalogAttribute.deleteMany({
      where: { workspaceId, catalogId: current.id },
    });
    await transaction.conversionCatalog.update({
      where: { id: current.id },
      data: {
        name: catalog.name,
        productName: catalog.productName,
        currency: catalog.currency,
        active: true,
      },
    });
    await transaction.conversionCatalogAttribute.createMany({
      data: catalog.attributes.map((attribute, index) => ({
        workspaceId,
        catalogId: current.id,
        position: index + 1,
        key: attribute.key,
        label: attribute.label,
      })),
    });
    await transaction.conversionCatalogVariant.createMany({
      data: catalog.variants.map((variant) => ({
        workspaceId,
        catalogId: current.id,
        normalizedKey: this.catalogVariantKey(variant.attributeValues),
        attributeValues: variant.attributeValues as Prisma.InputJsonValue,
        aliases: variant.aliases as Prisma.InputJsonValue,
        valueCents: variant.valueCents,
        contentName: variant.contentName ?? null,
      })),
    });
  }

  private catalogAliasUpdates(
    current: NonNullable<PersistedProviderRule["catalog"]>,
    next: ProviderConversionCatalogInputDto,
  ): Array<{ id: string; aliases: string[][] }> | null {
    const currentDto = this.catalogToDto(current);
    if (
      currentDto.name !== next.name ||
      currentDto.productName !== next.productName ||
      currentDto.currency !== next.currency ||
      currentDto.attributes.length !== next.attributes.length ||
      currentDto.variants.length !== next.variants.length
    ) {
      return null;
    }

    const attributesUnchanged = currentDto.attributes.every(
      (attribute, index) =>
        attribute.key === next.attributes[index]?.key &&
        attribute.label === next.attributes[index]?.label,
    );
    if (!attributesUnchanged) return null;

    const currentByKey = new Map(
      currentDto.variants.map((variant) => [variant.normalizedKey, variant]),
    );
    const updates: Array<{ id: string; aliases: string[][] }> = [];

    for (const variant of next.variants) {
      const currentVariant = currentByKey.get(
        this.catalogVariantKey(variant.attributeValues),
      );
      if (
        !currentVariant ||
        currentVariant.valueCents !== variant.valueCents ||
        (currentVariant.contentName ?? null) !==
          (variant.contentName ?? null) ||
        !this.sameStrings(
          currentVariant.attributeValues,
          variant.attributeValues,
        )
      ) {
        return null;
      }

      if (!this.sameNestedStrings(currentVariant.aliases, variant.aliases)) {
        updates.push({ id: currentVariant.id, aliases: variant.aliases });
      }
    }

    return updates;
  }

  private sameStrings(current: string[], next: string[]): boolean {
    return (
      current.length === next.length &&
      current.every((value, index) => value === next[index])
    );
  }

  private sameNestedStrings(current: string[][], next: string[][]): boolean {
    return (
      current.length === next.length &&
      current.every((values, index) =>
        this.sameStrings(values, next[index] ?? []),
      )
    );
  }

  private catalogVariantKey(values: string[]): string {
    return values
      .map((value) => this.normalizeCatalogValue(value))
      .join("\u001f");
  }

  private normalizeCatalogValue(value: string): string {
    return value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLocaleLowerCase("pt-BR")
      .replace(/\s+/g, " ");
  }

  private async requireRule(
    client: Pick<Prisma.TransactionClient, "providerConversionRuleConfig">,
    workspaceId: string,
    providerRuleId: string,
  ): Promise<PersistedProviderRule> {
    const rule = await client.providerConversionRuleConfig.findFirst({
      where: {
        id: providerRuleId,
        workspaceId,
        removedAt: null,
        connection: { removedAt: null },
      },
      include: providerRuleInclude,
    });

    if (!rule) {
      throw new NotFoundException(ruleNotFoundMessage);
    }

    return rule;
  }

  private toDto(rule: PersistedProviderRule): ProviderConversionRuleDto {
    return {
      id: rule.id,
      workspaceId: rule.workspaceId,
      conversionRule: {
        id: rule.conversionRule.id,
        workspaceId: rule.conversionRule.workspaceId,
        name: rule.conversionRule.name,
        triggerType: rule.conversionRule.triggerType,
        triggerValue: rule.conversionRule.triggerValue,
        matchMode: rule.conversionRule.matchMode,
        eventName: rule.conversionRule
          .eventName as ProviderConversionRuleDto["conversionRule"]["eventName"],
        pixelId: rule.conversionRule.pixelId,
        defaultValueCents: rule.conversionRule.defaultValueCents,
        defaultCurrency: rule.conversionRule.defaultCurrency,
        defaultContentName: rule.conversionRule.defaultContentName,
        defaultItems: Array.isArray(rule.conversionRule.defaultItems)
          ? (rule.conversionRule
              .defaultItems as ProviderConversionRuleDto["conversionRule"]["defaultItems"])
          : null,
        active: rule.conversionRule.active,
        createdAt: rule.conversionRule.createdAt.toISOString(),
        updatedAt: rule.conversionRule.updatedAt.toISOString(),
      },
      connectionId: rule.connectionId,
      mode: rule.mode,
      parserReleaseId: rule.parserReleaseId,
      productionActivatedAt: rule.productionActivatedAt?.toISOString() ?? null,
      channelIds: rule.channels.map((channel) => channel.channelId),
      triggerPhrases: rule.messageTriggerPhrases,
      messageAuthorScope: rule.messageAuthorScope,
      endpoint: rule.endpoint ? this.endpointToDto(rule.endpoint) : null,
      catalog: rule.catalog ? this.catalogToDto(rule.catalog) : null,
      lastExecution: rule.executions[0]
        ? {
            id: rule.executions[0].id,
            workspaceId: rule.executions[0].workspaceId,
            providerRuleId: rule.executions[0].providerRuleId,
            sourceDeliveryId: rule.executions[0].sourceDeliveryId,
            channelId: rule.executions[0].channelId,
            externalExecutionKey: rule.executions[0].externalExecutionKey,
            occurredAt: rule.executions[0].occurredAt.toISOString(),
            status: rule.executions[0].status,
            reasonCode: rule.executions[0].reasonCode,
            matchedCatalogVariantId: rule.executions[0].matchedCatalogVariantId,
            valueCents: rule.executions[0].valueCents,
            currency: rule.executions[0].currency,
            leadId: rule.executions[0].leadId,
            conversionEventLogId: rule.executions[0].conversionEventLogId,
            attemptCount: rule.executions[0].attemptCount,
            createdAt: rule.executions[0].createdAt.toISOString(),
            updatedAt: rule.executions[0].updatedAt.toISOString(),
          }
        : null,
      createdAt: rule.createdAt.toISOString(),
      updatedAt: rule.updatedAt.toISOString(),
    };
  }

  private endpointToDto(
    endpoint: PersistedProviderRule["endpoint"] extends infer T
      ? NonNullable<T>
      : never,
  ): ProviderConversionEndpointDto {
    return {
      id: endpoint.id,
      workspaceId: endpoint.workspaceId,
      providerRuleId: endpoint.providerRuleId,
      secretVersion: endpoint.secretVersion,
      lastDeliveryAt: endpoint.lastDeliveryAt?.toISOString() ?? null,
      lastSuccessfulParseAt:
        endpoint.lastSuccessfulParseAt?.toISOString() ?? null,
      rotatedAt: endpoint.rotatedAt?.toISOString() ?? null,
      removedAt: endpoint.removedAt?.toISOString() ?? null,
      createdAt: endpoint.createdAt.toISOString(),
      updatedAt: endpoint.updatedAt.toISOString(),
    };
  }

  private catalogToDto(
    catalog: NonNullable<PersistedProviderRule["catalog"]>,
  ): ProviderConversionCatalogDto {
    return {
      id: catalog.id,
      name: catalog.name,
      productName: catalog.productName,
      currency: catalog.currency,
      active: catalog.active,
      attributes: catalog.attributes.map((attribute) => ({
        id: attribute.id,
        position: attribute.position,
        key: attribute.key,
        label: attribute.label,
      })),
      variants: catalog.variants.map((variant) => ({
        id: variant.id,
        normalizedKey: variant.normalizedKey,
        attributeValues: this.toStringArray(variant.attributeValues),
        aliases: this.toNestedStringArray(variant.aliases),
        valueCents: variant.valueCents,
        contentName: variant.contentName,
        active: variant.active,
      })),
    };
  }

  private toStringArray(value: Prisma.JsonValue): string[] {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];
  }

  private toNestedStringArray(value: Prisma.JsonValue | null): string[][] {
    if (!Array.isArray(value)) return [];
    return value.map((items) => this.toStringArray(items));
  }

  private generateSecret(): string {
    return randomBytes(32).toString("base64url");
  }

  private hashSecret(secret: string): string {
    return createHash("sha256").update(secret, "utf8").digest("hex");
  }

  private buildWebhookUrl(
    apiPublicUrl: string,
    endpointId: string,
    secret: string,
  ): string {
    const url = new URL(
      `/webhooks/inbound/conversions/${encodeURIComponent(endpointId)}`,
      apiPublicUrl,
    );
    url.searchParams.set("token", secret);
    return url.toString();
  }

  private auditSummary(rule: PersistedProviderRule): Prisma.InputJsonObject {
    return {
      eventName: rule.conversionRule.eventName,
      triggerType: rule.conversionRule.triggerType,
      connectionId: rule.connectionId,
      channelCount: rule.channels.length,
      mode: rule.mode,
      active: rule.conversionRule.active,
      endpointSecretVersion: rule.endpoint?.secretVersion ?? null,
      catalogVariantCount: rule.catalog?.variants.length ?? 0,
    };
  }

  private async createAudit(
    transaction: Prisma.TransactionClient,
    input: {
      workspaceId: string;
      actorUserId: string;
      action: string;
      targetId: string;
      resultStatus: string;
      afterSummary: Prisma.InputJsonObject;
    },
  ): Promise<void> {
    await transaction.auditLog.create({
      data: {
        workspaceId: input.workspaceId,
        actorUserId: input.actorUserId,
        actorType: "user",
        action: input.action,
        targetType: "ProviderConversionRuleConfig",
        targetId: input.targetId,
        reason: null,
        sourceIp: null,
        resultStatus: input.resultStatus,
        beforeSummary: undefined,
        afterSummary: input.afterSummary,
      },
    });
  }
}
