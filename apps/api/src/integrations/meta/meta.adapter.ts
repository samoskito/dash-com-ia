import { Inject, Injectable } from "@nestjs/common";
import type {
  MetaAdAccountAssetDto,
  MetaBusinessAssetDto,
  MetaOAuthCallbackResultDto,
  MetaPixelAssetDto
} from "@wpptrack/shared";
import type {
  IntegrationAdapter,
  IntegrationEnv,
  IntegrationHealthDto
} from "../integration.types";
import { INTEGRATION_ENV } from "../integration.types";

type FetchLike = typeof fetch;

type MetaTokenResponse = {
  access_token?: unknown;
  token_type?: unknown;
  expires_in?: unknown;
  error?: {
    message?: unknown;
    type?: unknown;
    code?: unknown;
  };
};

type MetaGraphListResponse<T> = {
  data?: T[];
  error?: {
    message?: unknown;
    type?: unknown;
    code?: unknown;
  };
};

type MetaBusinessGraphNode = {
  id?: unknown;
  name?: unknown;
  verification_status?: unknown;
};

type MetaAdAccountGraphNode = {
  id?: unknown;
  name?: unknown;
  account_status?: unknown;
  currency?: unknown;
  timezone_name?: unknown;
};

type MetaPixelGraphNode = {
  id?: unknown;
  name?: unknown;
  code?: unknown;
};

export type MetaOAuthTokenExchangeResult = {
  publicResult: MetaOAuthCallbackResultDto;
  accessToken: string | null;
};

@Injectable()
export class MetaAdapter implements IntegrationAdapter {
  readonly provider = "meta" as const;

  constructor(
    @Inject(INTEGRATION_ENV) private readonly env: IntegrationEnv = process.env,
    private readonly fetchImpl: FetchLike = fetch
  ) {}

  async getHealth(): Promise<IntegrationHealthDto> {
    const hasCredentials = Boolean(this.env.META_APP_ID && this.env.META_APP_SECRET);

    return {
      provider: this.provider,
      status: hasCredentials ? "connected" : "disconnected",
      checkedAt: new Date().toISOString(),
      message: hasCredentials ? undefined : "Missing META_APP_ID or META_APP_SECRET"
    };
  }

  getOAuthAuthorizationUrl(state?: string): string {
    const params = new URLSearchParams({
      client_id: this.env.META_APP_ID ?? "",
      redirect_uri: this.env.META_OAUTH_REDIRECT_URL ?? "",
      scope: this.getScopes().join(","),
      response_type: "code"
    });

    if (state) {
      params.set("state", state);
    }

    return `https://www.facebook.com/${this.getGraphApiVersion()}/dialog/oauth?${params.toString()}`;
  }

  async exchangeCode(input: {
    code: string;
  }): Promise<MetaOAuthCallbackResultDto> {
    const result = await this.exchangeCodeForToken(input);

    return result.publicResult;
  }

  async exchangeCodeForToken(input: {
    code: string;
  }): Promise<MetaOAuthTokenExchangeResult> {
    const missingEnv = this.missingEnv([
      "META_APP_ID",
      "META_APP_SECRET",
      "META_OAUTH_REDIRECT_URL"
    ]);

    if (missingEnv.length > 0) {
      return {
        accessToken: null,
        publicResult: {
          provider: "meta",
          status: "configure_env",
          tokenType: null,
          expiresInSeconds: null,
          scopes: [],
          missingEnv,
          message: `Missing ${missingEnv.join(", ")}`
        }
      };
    }

    const params = new URLSearchParams({
      client_id: this.env.META_APP_ID ?? "",
      redirect_uri: this.env.META_OAUTH_REDIRECT_URL ?? "",
      client_secret: this.env.META_APP_SECRET ?? "",
      code: input.code
    });

    try {
      const response = await this.fetchImpl(
        `https://graph.facebook.com/${this.getGraphApiVersion()}/oauth/access_token?${params.toString()}`
      );
      const payload = (await response.json().catch(() => ({}))) as MetaTokenResponse;

      if (!response.ok || !this.asString(payload.access_token)) {
        return {
          accessToken: null,
          publicResult: {
            provider: "meta",
            status: "exchange_failed",
            tokenType: null,
            expiresInSeconds: null,
            scopes: [],
            missingEnv: [],
            message:
              this.asString(payload.error?.message) ??
              `Meta OAuth HTTP ${response.status}`
          }
        };
      }

      return {
        accessToken: this.asString(payload.access_token),
        publicResult: {
          provider: "meta",
          status: "connected",
          tokenType: this.asString(payload.token_type) ?? "bearer",
          expiresInSeconds: this.asPositiveInteger(payload.expires_in),
          scopes: this.getScopes(),
          missingEnv: [],
          message: "Meta OAuth conectado"
        }
      };
    } catch (error) {
      return {
        accessToken: null,
        publicResult: {
          provider: "meta",
          status: "exchange_failed",
          tokenType: null,
          expiresInSeconds: null,
          scopes: [],
          missingEnv: [],
          message: error instanceof Error ? error.message : "Erro ao trocar code Meta"
        }
      };
    }
  }

  async listBusinesses(input: {
    accessToken: string;
  }): Promise<MetaBusinessAssetDto[]> {
    const response = await this.getGraphList<MetaBusinessGraphNode>(
      "/me/businesses",
      "id,name,verification_status",
      input.accessToken
    );

    return response
      .map((item) => ({
        id: this.asString(item.id),
        name: this.asString(item.name),
        verificationStatus: this.asString(item.verification_status)
      }))
      .filter(
        (item): item is MetaBusinessAssetDto => Boolean(item.id && item.name)
      );
  }

  async listOwnedAdAccounts(input: {
    accessToken: string;
    businessId: string;
  }): Promise<MetaAdAccountAssetDto[]> {
    const response = await this.getGraphList<MetaAdAccountGraphNode>(
      `/${input.businessId}/owned_ad_accounts`,
      "id,name,account_status,currency,timezone_name",
      input.accessToken
    );

    return response
      .map((item) => ({
        id: this.asString(item.id),
        name: this.asString(item.name),
        accountStatus: this.asString(item.account_status),
        currency: this.asString(item.currency),
        timezoneName: this.asString(item.timezone_name)
      }))
      .filter(
        (item): item is MetaAdAccountAssetDto => Boolean(item.id && item.name)
      );
  }

  async listAdAccountPixels(input: {
    accessToken: string;
    adAccountId: string;
  }): Promise<MetaPixelAssetDto[]> {
    const response = await this.getGraphList<MetaPixelGraphNode>(
      `/${input.adAccountId}/adspixels`,
      "id,name,code",
      input.accessToken
    );

    return response
      .map((item) => ({
        id: this.asString(item.id),
        name: this.asString(item.name),
        code: this.asString(item.code)
      }))
      .filter((item): item is MetaPixelAssetDto => Boolean(item.id && item.name));
  }

  private getGraphApiVersion(): string {
    return this.env.META_GRAPH_API_VERSION ?? "v21.0";
  }

  private getScopes(): string[] {
    return (this.env.META_OAUTH_SCOPES ?? "ads_read,business_management,read_insights")
      .split(",")
      .map((scope) => scope.trim())
      .filter(Boolean);
  }

  private missingEnv(keys: string[]): string[] {
    return keys.filter((key) => !this.env[key]);
  }

  private asString(value: unknown): string | null {
    if (typeof value === "string" && value.trim()) {
      return value;
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }

    return null;
  }

  private asPositiveInteger(value: unknown): number | null {
    return typeof value === "number" && Number.isInteger(value) && value > 0
      ? value
      : null;
  }

  private async getGraphList<T>(
    path: string,
    fields: string,
    accessToken: string
  ): Promise<T[]> {
    const params = new URLSearchParams({
      fields,
      access_token: accessToken
    });
    const response = await this.fetchImpl(
      `https://graph.facebook.com/${this.getGraphApiVersion()}${path}?${params.toString()}`
    );
    const payload = (await response.json().catch(() => ({}))) as MetaGraphListResponse<T>;

    if (!response.ok) {
      throw new Error(
        this.asString(payload.error?.message) ??
          `Meta Graph HTTP ${response.status}`
      );
    }

    return Array.isArray(payload.data) ? payload.data : [];
  }
}
