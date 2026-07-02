import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { Inject, Injectable, Optional } from "@nestjs/common";
import type {
  MetaConnectionDto,
  MetaAssetSelectionInputDto,
  MetaAssetsDto,
  IntegrationHealthSummaryDto,
  IntegrationStartActionDto,
  MetaOAuthCallbackQueryDto,
  MetaOAuthCallbackResultDto
} from "@wpptrack/shared";
import { AsaasAdapter } from "./asaas/asaas.adapter";
import type { IntegrationEnv } from "./integration.types";
import { INTEGRATION_ENV } from "./integration.types";
import { MetaAdapter } from "./meta/meta.adapter";
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
    private readonly metaConnectionsService?: MetaConnectionsService
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
        selectedPixelId: null
      };
    }

    return this.metaConnectionsService.getConnection(workspaceId);
  }

  async getMetaAssets(workspaceId: string): Promise<MetaAssetsDto> {
    if (!this.metaConnectionsService) {
      return {
        workspaceId,
        status: "not_connected",
        businesses: [],
        adAccounts: [],
        pixels: [],
        selection: {
          businessId: null,
          adAccountId: null,
          pixelId: null
        },
        lastSyncedAt: null,
        syncError: null
      };
    }

    return this.metaConnectionsService.listAssets(workspaceId, this.metaAdapter);
  }

  async saveMetaAssetSelection(
    workspaceId: string,
    input: MetaAssetSelectionInputDto
  ): Promise<MetaConnectionDto> {
    if (!this.metaConnectionsService) {
      return this.getMetaConnection(workspaceId);
    }

    return this.metaConnectionsService.saveAssetSelection(workspaceId, input);
  }

  getUazapiStartAction(): IntegrationStartActionDto {
    const missingEnv = this.missingEnv(["UAZAPI_BASE_URL", "UAZAPI_TOKEN"]);

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

  private missingEnv(keys: string[]): string[] {
    return keys.filter((key) => !this.env[key]);
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
