import { createHash, randomBytes } from "node:crypto";
import { Inject, Injectable, Optional } from "@nestjs/common";
import type {
  MetaConnectionDto,
  MetaCapiTokenInputDto,
  MetaCapiTokenStatusDto,
  MetaConversionDestinationDto,
  MetaConversionDestinationInputDto,
  MetaAssetSelectionInputDto,
  MetaAssetsDto,
  MetaReportingAccountDto,
  MetaReportingAccountInputDto,
  IntegrationHealthSummaryDto,
  IntegrationPipelineOverviewDto,
  IntegrationStartActionDto,
  WhatsappDataSourceDto,
  MetaOAuthCallbackQueryDto,
  MetaOAuthCallbackResultDto
} from "@wpptrack/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { WorkspaceAccessPolicyService } from "../workspaces/workspace-access-policy.service";
import { AsaasAdapter } from "./asaas/asaas.adapter";
import type { IntegrationEnv } from "./integration.types";
import { INTEGRATION_ENV } from "./integration.types";
import { MetaAdapter } from "./meta/meta.adapter";
import { MetaAssetsService } from "./meta/meta-assets.service";
import { MetaConnectionsService } from "./meta/meta-connections.service";
import { UazapiAdapter } from "./uazapi/uazapi.adapter";

const metaOAuthStateTtlMs = 1000 * 60 * 10;

@Injectable()
export class IntegrationsService {
  constructor(
    private readonly metaAdapter: MetaAdapter,
    private readonly uazapiAdapter: UazapiAdapter,
    private readonly asaasAdapter: AsaasAdapter,
    @Inject(INTEGRATION_ENV) private readonly env: IntegrationEnv = process.env,
    @Inject(MetaConnectionsService)
    private readonly metaConnectionsService?: MetaConnectionsService,
    @Optional()
    @Inject(PrismaService)
    private readonly prisma?: PrismaService,
    @Optional()
    @Inject(MetaAssetsService)
    private readonly metaAssetsService?: MetaAssetsService,
    @Optional()
    @Inject(WorkspaceAccessPolicyService)
    private readonly accessPolicy: WorkspaceAccessPolicyService = new WorkspaceAccessPolicyService()
  ) {}

  async getHealthSummary(): Promise<IntegrationHealthSummaryDto> {
    return {
      checkedAt: new Date().toISOString(),
      providers: await Promise.all([
        this.metaAdapter.getHealth(),
        this.uazapiAdapter.getHealth(),
        this.asaasAdapter.getHealth()
      ])
    };
  }

  async getMetaStartAction(
    workspaceId?: string,
    actorUserId?: string
  ): Promise<IntegrationStartActionDto> {
    if (!this.isMetaOAuthEnabled()) {
      return {
        provider: "meta",
        action: "configure_env",
        label: "OAuth Meta desabilitado",
        missingEnv: ["META_CONNECTION_MODES=oauth"]
      };
    }

    const requiredEnv = [
      "META_APP_ID",
      "META_APP_SECRET",
      "META_OAUTH_REDIRECT_URL"
    ];
    const missingEnv = this.missingEnv(
      workspaceId ? [...requiredEnv, "META_TOKEN_ENCRYPTION_KEY"] : requiredEnv
    );

    if (missingEnv.length > 0) {
      return {
        provider: "meta",
        action: "configure_env",
        label: "Configurar app Meta",
        missingEnv
      };
    }

    const state = workspaceId
      ? await this.createMetaOAuthState(workspaceId, actorUserId)
      : undefined;

    return {
      provider: "meta",
      action: "oauth_redirect",
      label: "Conectar Meta via OAuth",
      href: this.metaAdapter.getOAuthAuthorizationUrl(state),
      missingEnv: []
    };
  }

  async handleMetaCallback(
    input: MetaOAuthCallbackQueryDto
  ): Promise<MetaOAuthCallbackResultDto> {
    if (!this.isMetaOAuthEnabled()) {
      return {
        provider: "meta",
        status: "exchange_failed",
        tokenType: null,
        expiresInSeconds: null,
        scopes: [],
        missingEnv: [],
        message: "OAuth Meta desabilitado neste ambiente"
      };
    }

    if (!input.state) {
      return {
        provider: "meta",
        status: "exchange_failed",
        tokenType: null,
        expiresInSeconds: null,
        scopes: [],
        missingEnv: [],
        message: "State OAuth Meta ausente"
      };
    }

    const workspaceId = await this.consumeMetaOAuthState(input.state);

    if (!workspaceId) {
      return {
        provider: "meta",
        status: "exchange_failed",
        tokenType: null,
        expiresInSeconds: null,
        scopes: [],
        missingEnv: [],
        message: "State OAuth Meta invalido ou expirado"
      };
    }

    const exchange = await this.metaAdapter.exchangeCodeForToken({
      code: input.code
    });

    if (
      exchange.publicResult.status !== "connected" ||
      !exchange.accessToken
    ) {
      return exchange.publicResult;
    }

    const connection =
      await this.requireMetaConnectionsService().saveOAuthConnection({
      workspaceId,
      accessToken: exchange.accessToken,
      tokenType: exchange.publicResult.tokenType,
      expiresInSeconds: exchange.publicResult.expiresInSeconds,
      scopes: exchange.publicResult.scopes
    });

    if (
      connection.status !== "connected" ||
      connection.workspaceId !== workspaceId
    ) {
      return {
        ...exchange.publicResult,
        status: "exchange_failed",
        message: "Conexao Meta nao foi salva no workspace solicitado"
      };
    }

    return {
      ...exchange.publicResult,
      connection
    };
  }

  async getMetaConnection(workspaceId: string): Promise<MetaConnectionDto> {
    if (!this.metaConnectionsService) {
      return {
        workspaceId,
        status: "not_connected",
        tokenType: null,
        scopes: [],
        expiresAt: null,
        connectedAt: null,
        selectedBusinessId: null,
        selectedAdAccountId: null,
        selectedPixelId: null,
        capiTokenConfigured: false
      };
    }

    return this.metaConnectionsService.getConnection(workspaceId);
  }

  async getMetaAssets(
    workspaceId: string,
    businessId?: string | null
  ): Promise<MetaAssetsDto> {
    if (!this.metaConnectionsService) {
      return this.emptyMetaAssets(workspaceId);
    }

    const assets = businessId
      ? this.metaConnectionsService.listAssets(
          workspaceId,
          this.metaAdapter,
          businessId
        )
      : this.metaConnectionsService.listAssets(workspaceId, this.metaAdapter);

    return this.withMetaOperationalData(workspaceId, assets);
  }

  async refreshMetaAssets(
    workspaceId: string,
    businessId?: string | null,
    actorUserId?: string | null
  ): Promise<MetaAssetsDto> {
    if (!this.metaConnectionsService) {
      return this.emptyMetaAssets(workspaceId);
    }

    return this.withMetaOperationalData(
      workspaceId,
      this.metaConnectionsService.refreshAssets(
        workspaceId,
        this.metaAdapter,
        businessId,
        actorUserId
      )
    );
  }

  private async withMetaOperationalData(
    workspaceId: string,
    assets: Promise<MetaAssetsDto>
  ): Promise<MetaAssetsDto> {
    const [baseAssets, conversionDestination, reportingAccounts] =
      await Promise.all([
        assets,
        this.getMetaConversionDestination(workspaceId),
        this.getMetaReportingAccounts(workspaceId)
      ]);

    return {
      ...baseAssets,
      pages: baseAssets.pages ?? [],
      conversionDestination,
      reportingAccounts
    };
  }

  private emptyMetaAssets(workspaceId: string): MetaAssetsDto {
    return {
      workspaceId,
      status: "not_connected",
      businesses: [],
      adAccounts: [],
      pixels: [],
      pages: [],
      conversionDestination: this.emptyConversionDestination(workspaceId),
      reportingAccounts: [],
      selection: {
        businessId: null,
        adAccountId: null,
        pixelId: null
      },
      lastSyncedAt: null,
      syncError: null
    };
  }

  async saveMetaAssetSelection(
    workspaceId: string,
    input: MetaAssetSelectionInputDto,
    actorUserId?: string | null
  ): Promise<MetaConnectionDto> {
    if (!this.metaConnectionsService) {
      return this.getMetaConnection(workspaceId);
    }

    return this.metaConnectionsService.saveAssetSelection(
      workspaceId,
      input,
      actorUserId
    );
  }

  async saveMetaCapiToken(
    workspaceId: string,
    input: MetaCapiTokenInputDto,
    actorUserId?: string | null
  ): Promise<MetaCapiTokenStatusDto> {
    if (!this.metaConnectionsService) {
      return {
        workspaceId,
        configured: false,
        updatedAt: new Date().toISOString()
      };
    }

    return this.metaConnectionsService.saveCapiToken(
      workspaceId,
      input,
      actorUserId
    );
  }

  async getMetaConversionDestination(
    workspaceId: string
  ): Promise<MetaConversionDestinationDto> {
    if (!this.metaAssetsService) {
      return this.emptyConversionDestination(workspaceId);
    }

    return this.metaAssetsService.getConversionDestination(workspaceId);
  }

  async saveMetaConversionDestination(
    workspaceId: string,
    input: MetaConversionDestinationInputDto,
    actorUserId?: string | null
  ): Promise<MetaConversionDestinationDto> {
    if (!this.metaAssetsService) {
      return this.emptyConversionDestination(workspaceId);
    }

    return this.metaAssetsService.saveConversionDestination(
      workspaceId,
      input,
      actorUserId
    );
  }

  async getMetaReportingAccounts(
    workspaceId: string
  ): Promise<MetaReportingAccountDto[]> {
    if (!this.metaAssetsService) {
      return [];
    }

    return this.metaAssetsService.listReportingAccounts(workspaceId);
  }

  async saveMetaReportingAccount(
    workspaceId: string,
    input: MetaReportingAccountInputDto,
    actorUserId?: string | null
  ): Promise<MetaReportingAccountDto> {
    if (!this.metaAssetsService) {
      throw new Error("Meta assets service is not available");
    }

    return this.metaAssetsService.saveReportingAccount(
      workspaceId,
      input,
      actorUserId
    );
  }

  async setMetaReportingAccountActive(
    workspaceId: string,
    id: string,
    active: boolean,
    actorUserId?: string | null
  ): Promise<MetaReportingAccountDto[]> {
    if (!this.metaAssetsService) {
      return [];
    }

    return this.metaAssetsService.setReportingAccountActive(
      workspaceId,
      id,
      active,
      actorUserId
    );
  }

  getUazapiStartAction(): IntegrationStartActionDto {
    const missingEnv = [
      ...this.missingEnv(["UAZAPI_BASE_URL"]),
      ...(!this.env.UAZAPI_ADMIN_TOKEN && !this.env.UAZAPI_TOKEN
        ? ["UAZAPI_ADMIN_TOKEN"]
        : [])
    ];

    return {
      provider: "uazapi",
      action: missingEnv.length > 0 ? "configure_env" : "wait_webhook",
      label:
        missingEnv.length > 0
          ? "Configurar Uazapi"
          : "Uazapi pronta para provisionar instancia",
      missingEnv
    };
  }

  getAsaasStatusAction(): IntegrationStartActionDto {
    const missingEnv = this.missingEnv(["ASAAS_BASE_URL", "ASAAS_API_KEY"]);

    return {
      provider: "asaas",
      action: missingEnv.length > 0 ? "configure_env" : "wait_webhook",
      label:
        missingEnv.length > 0
          ? "Configurar Asaas"
          : "Asaas pronto para cobrancas e webhooks",
      missingEnv
    };
  }

  async getWhatsappDataSource(
    workspaceId: string,
  ): Promise<WhatsappDataSourceDto> {
    if (!this.prisma) {
      return this.nativeWhatsappDataSource();
    }

    const connector = await this.prisma.externalDataConnector.findFirst({
      where: {
        workspaceId,
        status: "active",
      },
      orderBy: { updatedAt: "desc" },
      select: {
        name: true,
        provider: true,
        lastSyncCompletedAt: true,
        lastSyncStatus: true,
      },
    });

    if (!connector) {
      return this.nativeWhatsappDataSource();
    }

    return {
      mode: "external",
      connectorName: connector.name,
      provider: connector.provider,
      lastSyncCompletedAt: connector.lastSyncCompletedAt?.toISOString() ?? null,
      lastSyncStatus: connector.lastSyncStatus,
    };
  }

  async getPipelineOverview(
    workspaceId: string,
    now = new Date()
  ): Promise<IntegrationPipelineOverviewDto> {
    if (!this.prisma) {
      return this.emptyPipelineOverview(workspaceId);
    }

    const since = new Date(now);
    since.setDate(since.getDate() - 7);

    const [
      ctwaLeads,
      webhooksReceived,
      leadsTracked,
      conversionsReady,
      metaSent,
      whatsappSource,
    ] = await Promise.all([
      this.prisma.lead.count({
        where: {
          workspaceId,
          createdAt: { gte: since },
          OR: [
            { campaignId: { not: null } },
            { adSetId: { not: null } },
            { adId: { not: null } },
            { ctwaClid: { not: null } },
          ],
        },
      }),
      this.prisma.webhookLog.count({
        where: {
          workspaceId,
          source: "uazapi",
          receivedAt: { gte: since }
        }
      }),
      this.prisma.lead.count({
        where: {
          workspaceId,
          createdAt: { gte: since }
        }
      }),
      this.prisma.conversionEventLog.count({
        where: {
          workspaceId,
          status: "ready_to_send",
          createdAt: { gte: since }
        }
      }),
      this.prisma.conversionEventLog.count({
        where: {
          workspaceId,
          status: "sent",
          createdAt: { gte: since },
        },
      }),
      this.getWhatsappDataSource(workspaceId),
    ]);

    return {
      workspaceId,
      rangeLabel: "Ultimos 7 dias",
      whatsappSource,
      stages: [
        {
          key: "ctwa",
          label: "CTWA",
          value: ctwaLeads,
          detail: "Leads com origem de campanha Meta"
        },
        {
          key: "webhook",
          label: "Webhook",
          value: webhooksReceived,
          detail: "Webhooks Uazapi recebidos"
        },
        {
          key: "lead",
          label: "Lead",
          value: leadsTracked,
          detail: "Leads rastreados pelo WhatsApp"
        },
        {
          key: "conversion_ready",
          label: "CAPI pronta",
          value: conversionsReady,
          detail: "Eventos aguardando envio para Meta"
        },
        {
          key: "meta_sent",
          label: "Meta ACK",
          value: metaSent,
          detail: "Eventos enviados para Meta"
        }
      ]
    };
  }

  private missingEnv(keys: string[]): string[] {
    return keys.filter((key) => !this.env[key]);
  }

  private emptyPipelineOverview(workspaceId: string): IntegrationPipelineOverviewDto {
    return {
      workspaceId,
      rangeLabel: "Ultimos 7 dias",
      whatsappSource: this.nativeWhatsappDataSource(),
      stages: [
        {
          key: "ctwa",
          label: "CTWA",
          value: 0,
          detail: "Leads com origem de campanha Meta"
        },
        {
          key: "webhook",
          label: "Webhook",
          value: 0,
          detail: "Webhooks Uazapi recebidos"
        },
        {
          key: "lead",
          label: "Lead",
          value: 0,
          detail: "Leads rastreados pelo WhatsApp"
        },
        {
          key: "conversion_ready",
          label: "CAPI pronta",
          value: 0,
          detail: "Eventos aguardando envio para Meta"
        },
        {
          key: "meta_sent",
          label: "Meta ACK",
          value: 0,
          detail: "Eventos enviados para Meta"
        }
      ]
    };
  }

  private nativeWhatsappDataSource(): WhatsappDataSourceDto {
    return {
      mode: "native",
      connectorName: null,
      provider: null,
      lastSyncCompletedAt: null,
      lastSyncStatus: null,
    };
  }

  private emptyConversionDestination(
    workspaceId: string
  ): MetaConversionDestinationDto {
    return {
      workspaceId,
      pixelId: null,
      pixelName: null,
      pageId: null,
      pageName: null,
      status: "needs_configuration",
      lastValidatedAt: null,
      validationError: null
    };
  }

  private async createMetaOAuthState(
    workspaceId: string,
    actorUserId?: string
  ): Promise<string> {
    if (!actorUserId) {
      throw new Error("Usuario ausente ao iniciar OAuth Meta");
    }

    const state = randomBytes(32).toString("base64url");

    await this.requirePrisma().metaOAuthState.create({
      data: {
        stateHash: this.hashMetaOAuthState(state),
        workspaceId,
        userId: actorUserId,
        expiresAt: new Date(Date.now() + metaOAuthStateTtlMs)
      }
    });

    return state;
  }

  private async consumeMetaOAuthState(state: string): Promise<string | null> {
    const prisma = this.requirePrisma();
    const now = new Date();
    const savedState = await prisma.metaOAuthState.findUnique({
      where: { stateHash: this.hashMetaOAuthState(state) },
      select: {
        id: true,
        workspaceId: true,
        userId: true,
        expiresAt: true,
        consumedAt: true
    }
    });

    if (
      !savedState ||
      savedState.consumedAt ||
      savedState.expiresAt.getTime() <= now.getTime()
    ) {
      return null;
    }

    const membership = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: savedState.workspaceId,
          userId: savedState.userId
        }
      },
      select: { id: true, role: true, canManageMembers: true }
    });

    if (
      !membership ||
      !this.accessPolicy.getPermissions(
        membership.role,
        membership.canManageMembers
      ).canManageIntegrations
    ) {
      return null;
    }

    const consumed = await prisma.metaOAuthState.updateMany({
      where: {
        id: savedState.id,
        consumedAt: null,
        expiresAt: { gt: now }
      },
      data: { consumedAt: now }
    });

    return consumed.count === 1 ? savedState.workspaceId : null;
  }

  private hashMetaOAuthState(state: string): string {
    return createHash("sha256").update(state).digest("hex");
  }

  private isMetaOAuthEnabled(): boolean {
    const modes = (this.env.META_CONNECTION_MODES ?? "oauth")
      .split(",")
      .map((mode) => mode.trim().toLowerCase())
      .filter(Boolean);

    return modes.includes("oauth");
  }

  private requireMetaConnectionsService(): MetaConnectionsService {
    if (!this.metaConnectionsService) {
      throw new Error("MetaConnectionsService indisponivel");
    }

    return this.metaConnectionsService;
  }

  private requirePrisma(): PrismaService {
    if (!this.prisma) {
      throw new Error("PrismaService indisponivel para OAuth Meta");
    }

    return this.prisma;
  }
}
