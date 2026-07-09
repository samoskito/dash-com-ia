import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
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
  MetaOAuthCallbackQueryDto,
  MetaOAuthCallbackResultDto
} from "@wpptrack/shared";
import { PrismaService } from "../common/prisma/prisma.service";
import { AsaasAdapter } from "./asaas/asaas.adapter";
import type { IntegrationEnv } from "./integration.types";
import { INTEGRATION_ENV } from "./integration.types";
import { MetaAdapter } from "./meta/meta.adapter";
import { MetaAssetsService } from "./meta/meta-assets.service";
import { MetaConnectionsService } from "./meta/meta-connections.service";
import { UazapiAdapter } from "./uazapi/uazapi.adapter";

@Injectable()
export class IntegrationsService {
  constructor(
    private readonly metaAdapter: MetaAdapter,
    private readonly uazapiAdapter: UazapiAdapter,
    private readonly asaasAdapter: AsaasAdapter,
    @Inject(INTEGRATION_ENV) private readonly env: IntegrationEnv = process.env,
    @Optional()
    private readonly metaConnectionsService?: MetaConnectionsService,
    @Optional()
    @Inject(PrismaService)
    private readonly prisma?: PrismaService,
    @Optional()
    @Inject(MetaAssetsService)
    private readonly metaAssetsService?: MetaAssetsService
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

  getMetaStartAction(workspaceId?: string): IntegrationStartActionDto {
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

    return {
      provider: "meta",
      action: "oauth_redirect",
      label: "Conectar Meta via OAuth",
      href: this.metaAdapter.getOAuthAuthorizationUrl(
        workspaceId ? this.createMetaOAuthState(workspaceId) : undefined
      ),
      missingEnv: []
    };
  }

  async handleMetaCallback(
    input: MetaOAuthCallbackQueryDto
  ): Promise<MetaOAuthCallbackResultDto> {
    const exchange = await this.metaAdapter.exchangeCodeForToken({
      code: input.code
    });

    if (
      exchange.publicResult.status !== "connected" ||
      !exchange.accessToken ||
      !input.state ||
      !this.metaConnectionsService
    ) {
      return exchange.publicResult;
    }

    const workspaceId = this.readMetaOAuthState(input.state);

    if (!workspaceId) {
      return {
        ...exchange.publicResult,
        status: "exchange_failed",
        message: "State OAuth Meta invalido"
      };
    }

    const connection = await this.metaConnectionsService.saveOAuthConnection({
      workspaceId,
      accessToken: exchange.accessToken,
      tokenType: exchange.publicResult.tokenType,
      expiresInSeconds: exchange.publicResult.expiresInSeconds,
      scopes: exchange.publicResult.scopes
    });

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

    const assets = businessId
      ? this.metaConnectionsService.listAssets(
          workspaceId,
          this.metaAdapter,
          businessId
        )
      : this.metaConnectionsService.listAssets(workspaceId, this.metaAdapter);
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
      metaSent
    ] = await Promise.all([
      this.prisma.lead.count({
        where: {
          workspaceId,
          createdAt: { gte: since },
          OR: [
            { campaignId: { not: null } },
            { adSetId: { not: null } },
            { adId: { not: null } }
          ]
        }
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
          createdAt: { gte: since }
        }
      })
    ]);

    return {
      workspaceId,
      rangeLabel: "Ultimos 7 dias",
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

  private createMetaOAuthState(workspaceId: string): string {
    const payload = Buffer.from(
      JSON.stringify({
        workspaceId,
        nonce: randomBytes(16).toString("hex")
      })
    ).toString("base64url");
    const signature = this.signStatePayload(payload);

    return `${payload}.${signature}`;
  }

  private readMetaOAuthState(state: string): string | null {
    const [payload, signature] = state.split(".");

    if (!payload || !signature) {
      return null;
    }

    const expected = this.signStatePayload(payload);
    const expectedBuffer = Buffer.from(expected);
    const signatureBuffer = Buffer.from(signature);

    if (
      expectedBuffer.length !== signatureBuffer.length ||
      !timingSafeEqual(expectedBuffer, signatureBuffer)
    ) {
      return null;
    }

    try {
      const decoded = JSON.parse(
        Buffer.from(payload, "base64url").toString("utf8")
      ) as { workspaceId?: unknown };

      return typeof decoded.workspaceId === "string" && decoded.workspaceId
        ? decoded.workspaceId
        : null;
    } catch {
      return null;
    }
  }

  private signStatePayload(payload: string): string {
    const secret = this.env.META_TOKEN_ENCRYPTION_KEY;

    if (!secret) {
      throw new Error("Missing META_TOKEN_ENCRYPTION_KEY");
    }

    return createHmac("sha256", secret).update(payload).digest("base64url");
  }
}
