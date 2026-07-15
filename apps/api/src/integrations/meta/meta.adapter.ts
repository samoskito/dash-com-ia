import { Inject, Injectable, Optional } from "@nestjs/common";
import type {
  MetaAdAccountAssetDto,
  MetaBusinessAssetDto,
  MetaOAuthCallbackResultDto,
  MetaPageAssetDto,
  MetaPixelAssetDto,
} from "@wpptrack/shared";
import {
  RUNTIME_FETCH,
  type RuntimeFetch,
} from "../../common/runtime/runtime.module";
import type {
  IntegrationAdapter,
  IntegrationEnv,
  IntegrationHealthDto,
} from "../integration.types";
import { INTEGRATION_ENV } from "../integration.types";

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
  paging?: {
    next?: unknown;
  };
  error?: {
    message?: unknown;
    type?: unknown;
    code?: unknown;
  };
};

type MetaGraphMutationResponse = {
  success?: unknown;
  error?: {
    message?: unknown;
    type?: unknown;
    code?: unknown;
  };
};

type MetaGraphObjectResponse = Record<string, unknown> & {
  error?: {
    message?: unknown;
    type?: unknown;
    code?: unknown;
  };
};

type MetaPermissionGraphNode = {
  permission?: unknown;
  status?: unknown;
};

export type MetaTokenProfile = {
  id: string;
  name: string;
  scopes: string[];
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
};

type MetaPageGraphNode = {
  id?: unknown;
  name?: unknown;
};

export type MetaOAuthTokenExchangeResult = {
  publicResult: MetaOAuthCallbackResultDto;
  accessToken: string | null;
};

export type MetaCampaignAsset = {
  id: string;
  name: string;
  status: string | null;
  effectiveStatus: string | null;
  objective: string | null;
  dailyBudgetCents: number | null;
  lifetimeBudgetCents: number | null;
};

export type MetaAdSetAsset = {
  id: string;
  name: string;
  campaignId: string;
  status: string | null;
  effectiveStatus: string | null;
  destinationType: string | null;
  dailyBudgetCents: number | null;
  lifetimeBudgetCents: number | null;
};

export type MetaAdAsset = {
  id: string;
  name: string;
  campaignId: string;
  adSetId: string;
  status: string | null;
  effectiveStatus: string | null;
  creativeId: string | null;
  thumbnailUrl: string | null;
  previewUrl: string | null;
  callToActionType: string | null;
};

export type MetaCampaignInsight = {
  campaignId: string;
  spendCents: number;
  impressions: number;
  clicks: number;
  metaConversationsStarted: number;
};

export type MetaCampaignDailyInsight = MetaCampaignInsight & {
  date: string;
};

export type MetaAdSetInsight = {
  adSetId: string;
  campaignId: string;
  spendCents: number;
  impressions: number;
  clicks: number;
  metaConversationsStarted: number;
};

export type MetaAdInsight = {
  adId: string;
  adSetId: string;
  campaignId: string;
  spendCents: number;
  impressions: number;
  clicks: number;
  metaConversationsStarted: number;
};

export type MetaInsightReadMode = "legacy" | "manual";

type MetaCampaignGraphNode = {
  id?: unknown;
  name?: unknown;
  status?: unknown;
  effective_status?: unknown;
  objective?: unknown;
  daily_budget?: unknown;
  lifetime_budget?: unknown;
};

type MetaAdSetGraphNode = {
  id?: unknown;
  name?: unknown;
  campaign_id?: unknown;
  status?: unknown;
  effective_status?: unknown;
  destination_type?: unknown;
  daily_budget?: unknown;
  lifetime_budget?: unknown;
};

type MetaCreativeGraphNode = {
  id?: unknown;
  call_to_action_type?: unknown;
  thumbnail_url?: unknown;
  image_url?: unknown;
  video_id?: unknown;
  object_story_spec?: {
    video_data?: {
      image_url?: unknown;
      video_id?: unknown;
    };
    link_data?: {
      image_url?: unknown;
      child_attachments?: Array<{
        image_url?: unknown;
        video_id?: unknown;
      }>;
    };
  };
  asset_feed_spec?: {
    images?: Array<{
      url?: unknown;
    }>;
    videos?: Array<{
      thumbnail_url?: unknown;
      video_id?: unknown;
    }>;
  };
};

type MetaAdGraphNode = {
  id?: unknown;
  name?: unknown;
  campaign_id?: unknown;
  adset_id?: unknown;
  status?: unknown;
  effective_status?: unknown;
  creative?: MetaCreativeGraphNode;
};

type MetaVideoThumbnailGraphNode = {
  uri?: unknown;
  height?: unknown;
  width?: unknown;
  is_preferred?: unknown;
};

type MetaGraphBatchItem = {
  code?: unknown;
  body?: unknown;
};

type MetaInsightGraphNode = {
  campaign_id?: unknown;
  adset_id?: unknown;
  ad_id?: unknown;
  spend?: unknown;
  impressions?: unknown;
  clicks?: unknown;
  date_start?: unknown;
  date_stop?: unknown;
  actions?: Array<{
    action_type?: unknown;
    value?: unknown;
  }>;
};

@Injectable()
export class MetaAdapter implements IntegrationAdapter {
  readonly provider = "meta" as const;

  constructor(
    @Inject(INTEGRATION_ENV) private readonly env: IntegrationEnv = process.env,
    @Optional()
    @Inject(RUNTIME_FETCH)
    private readonly fetchImpl: RuntimeFetch = fetch,
  ) {}

  async getHealth(): Promise<IntegrationHealthDto> {
    const hasCredentials = Boolean(
      this.env.META_APP_ID && this.env.META_APP_SECRET,
    );

    return {
      provider: this.provider,
      status: hasCredentials ? "connected" : "disconnected",
      checkedAt: new Date().toISOString(),
      message: hasCredentials
        ? undefined
        : "Missing META_APP_ID or META_APP_SECRET",
    };
  }

  getOAuthAuthorizationUrl(state?: string): string {
    const params = new URLSearchParams({
      client_id: this.env.META_APP_ID ?? "",
      redirect_uri: this.env.META_OAUTH_REDIRECT_URL ?? "",
      scope: this.getScopes().join(","),
      response_type: "code",
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
      "META_OAUTH_REDIRECT_URL",
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
          message: `Missing ${missingEnv.join(", ")}`,
        },
      };
    }

    const params = new URLSearchParams({
      client_id: this.env.META_APP_ID ?? "",
      redirect_uri: this.env.META_OAUTH_REDIRECT_URL ?? "",
      client_secret: this.env.META_APP_SECRET ?? "",
      code: input.code,
    });

    try {
      const response = await this.fetchImpl(
        `https://graph.facebook.com/${this.getGraphApiVersion()}/oauth/access_token?${params.toString()}`,
      );
      const payload = (await response
        .json()
        .catch(() => ({}))) as MetaTokenResponse;
      const shortLivedAccessToken = this.asString(payload.access_token);

      if (!response.ok || !shortLivedAccessToken) {
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
              `Meta OAuth HTTP ${response.status}`,
          },
        };
      }

      const extendedToken = await this.exchangeForLongLivedToken(
        shortLivedAccessToken,
      );

      return {
        accessToken: extendedToken.accessToken,
        publicResult: {
          provider: "meta",
          status: "connected",
          tokenType:
            extendedToken.tokenType ??
            this.asString(payload.token_type) ??
            "bearer",
          expiresInSeconds:
            extendedToken.expiresInSeconds ??
            this.asPositiveInteger(payload.expires_in),
          scopes: this.getScopes(),
          missingEnv: [],
          message: "Meta OAuth conectado",
        },
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
          message:
            error instanceof Error ? error.message : "Erro ao trocar code Meta",
        },
      };
    }
  }

  private async exchangeForLongLivedToken(
    shortLivedAccessToken: string,
  ): Promise<{
    accessToken: string;
    tokenType: string | null;
    expiresInSeconds: number | null;
  }> {
    const params = new URLSearchParams({
      grant_type: "fb_exchange_token",
      client_id: this.env.META_APP_ID ?? "",
      client_secret: this.env.META_APP_SECRET ?? "",
      fb_exchange_token: shortLivedAccessToken,
    });
    const response = await this.fetchImpl(
      `https://graph.facebook.com/${this.getGraphApiVersion()}/oauth/access_token?${params.toString()}`,
    );
    const payload = (await response
      .json()
      .catch(() => ({}))) as MetaTokenResponse;
    const accessToken = this.asString(payload.access_token);

    if (!response.ok || !accessToken) {
      throw new Error(
        this.asString(payload.error?.message) ??
          `Meta long-lived token HTTP ${response.status}`,
      );
    }

    return {
      accessToken,
      tokenType: this.asString(payload.token_type),
      expiresInSeconds: this.asPositiveInteger(payload.expires_in),
    };
  }

  async listBusinesses(input: {
    accessToken: string;
  }): Promise<MetaBusinessAssetDto[]> {
    const response = await this.getGraphList<MetaBusinessGraphNode>(
      "/me/businesses",
      "id,name,verification_status",
      input.accessToken,
    );

    return response
      .map((item) => ({
        id: this.asString(item.id),
        name: this.asString(item.name),
        verificationStatus: this.asString(item.verification_status),
      }))
      .filter((item): item is MetaBusinessAssetDto =>
        Boolean(item.id && item.name),
      );
  }

  async getTokenProfile(input: {
    accessToken: string;
  }): Promise<MetaTokenProfile> {
    const [profile, permissions] = await Promise.all([
      this.getGraphObject<MetaGraphObjectResponse>(
        "/me",
        "id,name",
        input.accessToken,
      ),
      this.getGraphList<MetaPermissionGraphNode>(
        "/me/permissions",
        "permission,status",
        input.accessToken,
      ).catch(() => []),
    ]);
    const id = this.asString(profile.id);
    const name = this.asString(profile.name) ?? "Usuario do sistema Meta";

    if (!id) {
      throw new Error("A Meta nao confirmou a identidade deste token");
    }

    return {
      id,
      name,
      scopes: permissions
        .filter(
          (permission) =>
            this.asString(permission.status)?.toLowerCase() === "granted",
        )
        .map((permission) => this.asString(permission.permission))
        .filter((permission): permission is string => Boolean(permission)),
    };
  }

  async getBusiness(input: {
    accessToken: string;
    businessId: string;
  }): Promise<MetaBusinessAssetDto> {
    const item = await this.getGraphObject<MetaBusinessGraphNode>(
      `/${input.businessId}`,
      "id,name,verification_status",
      input.accessToken,
    );
    const id = this.asString(item.id);
    const name = this.asString(item.name);

    if (!id || !name) {
      throw new Error("A Meta nao confirmou o Business Manager informado");
    }

    return {
      id,
      name,
      verificationStatus: this.asString(item.verification_status),
    };
  }

  async getAdAccount(input: {
    accessToken: string;
    adAccountId: string;
    businessId?: string | null;
  }): Promise<MetaAdAccountAssetDto> {
    const item = await this.getGraphObject<MetaAdAccountGraphNode>(
      `/${input.adAccountId}`,
      "id,name,account_status,currency,timezone_name",
      input.accessToken,
    );
    const id = this.asString(item.id);
    const name = this.asString(item.name);

    if (!id || !name) {
      throw new Error("A Meta nao confirmou a conta de anuncios informada");
    }

    return {
      id,
      businessId: input.businessId ?? null,
      name,
      accountStatus: this.asString(item.account_status),
      currency: this.asString(item.currency),
      timezoneName: this.asString(item.timezone_name),
    };
  }

  async getPixel(input: {
    accessToken: string;
    pixelId: string;
    businessId?: string | null;
  }): Promise<MetaPixelAssetDto> {
    const item = await this.getGraphObject<MetaPixelGraphNode>(
      `/${input.pixelId}`,
      "id,name",
      input.accessToken,
    );
    const id = this.asString(item.id);
    const name = this.asString(item.name);

    if (!id || !name) {
      throw new Error("A Meta nao confirmou o Pixel/Dataset informado");
    }

    return {
      id,
      businessId: input.businessId ?? null,
      name,
      code: null,
    };
  }

  async getPage(input: {
    accessToken: string;
    pageId: string;
    businessId?: string | null;
  }): Promise<MetaPageAssetDto> {
    const item = await this.getGraphObject<MetaPageGraphNode>(
      `/${input.pageId}`,
      "id,name",
      input.accessToken,
    );
    const id = this.asString(item.id);
    const name = this.asString(item.name);

    if (!id || !name) {
      throw new Error("A Meta nao confirmou a Pagina informada");
    }

    return {
      id,
      businessId: input.businessId ?? null,
      name,
    };
  }

  async listOwnedAdAccounts(input: {
    accessToken: string;
    businessId: string;
  }): Promise<MetaAdAccountAssetDto[]> {
    const response = await this.getGraphList<MetaAdAccountGraphNode>(
      `/${input.businessId}/owned_ad_accounts`,
      "id,name,account_status,currency,timezone_name",
      input.accessToken,
    );

    return response
      .map((item) => ({
        id: this.asString(item.id),
        businessId: input.businessId as string | null,
        name: this.asString(item.name),
        accountStatus: this.asString(item.account_status),
        currency: this.asString(item.currency),
        timezoneName: this.asString(item.timezone_name),
      }))
      .filter((item): item is MetaAdAccountAssetDto =>
        Boolean(item.id && item.name),
      );
  }

  async listBusinessPixels(input: {
    accessToken: string;
    businessId: string;
  }): Promise<MetaPixelAssetDto[]> {
    const response = await this.getGraphList<MetaPixelGraphNode>(
      `/${input.businessId}/adspixels`,
      "id,name",
      input.accessToken,
    );

    return response
      .map((item): MetaPixelAssetDto | null => {
        const id = this.asString(item.id);
        const name = this.asString(item.name);

        if (!id || !name) {
          return null;
        }

        return {
          id,
          businessId: input.businessId,
          name,
          code: null,
        };
      })
      .filter((item): item is MetaPixelAssetDto => Boolean(item));
  }

  async listAdAccountPixels(input: {
    accessToken: string;
    adAccountId: string;
  }): Promise<MetaPixelAssetDto[]> {
    const response = await this.getGraphList<MetaPixelGraphNode>(
      `/${input.adAccountId}/adspixels`,
      "id,name",
      input.accessToken,
    );

    return response
      .map((item): MetaPixelAssetDto | null => {
        const id = this.asString(item.id);
        const name = this.asString(item.name);

        if (!id || !name) {
          return null;
        }

        return {
          id,
          businessId: null,
          name,
          code: null,
        };
      })
      .filter((item): item is MetaPixelAssetDto => Boolean(item));
  }

  async listPages(input: { accessToken: string }): Promise<MetaPageAssetDto[]> {
    const response = await this.getGraphList<MetaPageGraphNode>(
      "/me/accounts",
      "id,name",
      input.accessToken,
    );

    return response
      .map((item): MetaPageAssetDto | null => {
        const id = this.asString(item.id);
        const name = this.asString(item.name);

        if (!id || !name) {
          return null;
        }

        return {
          id,
          businessId: null,
          name,
        };
      })
      .filter((item): item is MetaPageAssetDto => Boolean(item));
  }

  async listBusinessPages(input: {
    accessToken: string;
    businessId: string;
  }): Promise<MetaPageAssetDto[]> {
    const [ownedPages, clientPages] = await Promise.all([
      this.getGraphList<MetaPageGraphNode>(
        `/${input.businessId}/owned_pages`,
        "id,name",
        input.accessToken,
      ),
      this.getGraphList<MetaPageGraphNode>(
        `/${input.businessId}/client_pages`,
        "id,name",
        input.accessToken,
      ),
    ]);
    const pagesById = new Map<string, MetaPageAssetDto>();

    for (const item of [...ownedPages, ...clientPages]) {
      const id = this.asString(item.id);
      const name = this.asString(item.name);

      if (!id || !name || pagesById.has(id)) {
        continue;
      }

      pagesById.set(id, {
        id,
        businessId: input.businessId,
        name,
      });
    }

    return [...pagesById.values()];
  }

  async listCampaigns(input: {
    accessToken: string;
    adAccountId: string;
  }): Promise<MetaCampaignAsset[]> {
    const response = await this.getGraphList<MetaCampaignGraphNode>(
      `/${input.adAccountId}/campaigns`,
      "id,name,status,effective_status,objective,daily_budget,lifetime_budget",
      input.accessToken,
    );

    return response
      .map((item) => ({
        id: this.asString(item.id),
        name: this.asString(item.name),
        status: this.asString(item.status),
        effectiveStatus: this.asString(item.effective_status),
        objective: this.asString(item.objective),
        dailyBudgetCents: this.asMinorCurrencyUnit(item.daily_budget),
        lifetimeBudgetCents: this.asMinorCurrencyUnit(item.lifetime_budget),
      }))
      .filter((item): item is MetaCampaignAsset =>
        Boolean(item.id && item.name),
      );
  }

  async listAdSets(input: {
    accessToken: string;
    adAccountId: string;
  }): Promise<MetaAdSetAsset[]> {
    const response = await this.getGraphList<MetaAdSetGraphNode>(
      `/${input.adAccountId}/adsets`,
      "id,name,campaign_id,status,effective_status,destination_type,daily_budget,lifetime_budget",
      input.accessToken,
    );

    return response
      .map((item) => ({
        id: this.asString(item.id),
        name: this.asString(item.name),
        campaignId: this.asString(item.campaign_id),
        status: this.asString(item.status),
        effectiveStatus: this.asString(item.effective_status),
        destinationType: this.asString(item.destination_type),
        dailyBudgetCents: this.asMinorCurrencyUnit(item.daily_budget),
        lifetimeBudgetCents: this.asMinorCurrencyUnit(item.lifetime_budget),
      }))
      .filter((item): item is MetaAdSetAsset =>
        Boolean(item.id && item.name && item.campaignId),
      );
  }

  async listAds(input: {
    accessToken: string;
    adAccountId: string;
  }): Promise<MetaAdAsset[]> {
    const response = await this.getGraphList<MetaAdGraphNode>(
      `/${input.adAccountId}/ads`,
      "id,name,campaign_id,adset_id,status,effective_status,creative{id,call_to_action_type,thumbnail_url}",
      input.accessToken,
    );
    const creativeIds = [
      ...new Set(
        response
          .map((item) => this.asString(item.creative?.id))
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    let previewUrls = new Map<string, string>();

    try {
      previewUrls = await this.getCreativePreviewUrls(
        creativeIds,
        input.accessToken,
      );
    } catch (error) {
      console.warn("[wpptrack:meta-graph] creative preview enrichment failed", {
        creativeCount: creativeIds.length,
        message:
          error instanceof Error ? error.message : "Meta Graph batch failed",
      });
    }

    return response
      .map((item) => {
        const creativeId = this.asString(item.creative?.id);

        return {
          id: this.asString(item.id),
          name: this.asString(item.name),
          campaignId: this.asString(item.campaign_id),
          adSetId: this.asString(item.adset_id),
          status: this.asString(item.status),
          effectiveStatus: this.asString(item.effective_status),
          creativeId,
          thumbnailUrl: this.asHttpUrl(item.creative?.thumbnail_url),
          previewUrl: creativeId ? (previewUrls.get(creativeId) ?? null) : null,
          callToActionType: this.asString(item.creative?.call_to_action_type),
        };
      })
      .filter((item): item is MetaAdAsset =>
        Boolean(item.id && item.name && item.campaignId && item.adSetId),
      );
  }

  async updateEntityStatus(input: {
    accessToken: string;
    id: string;
    status: "ACTIVE" | "PAUSED";
  }): Promise<void> {
    await this.postGraphUpdate(input.id, input.accessToken, {
      status: input.status,
    });
  }

  async updateEntityBudget(input: {
    accessToken: string;
    id: string;
    budgetType: "daily" | "lifetime";
    budgetCents: number;
  }): Promise<void> {
    await this.postGraphUpdate(input.id, input.accessToken, {
      [input.budgetType === "daily" ? "daily_budget" : "lifetime_budget"]:
        String(input.budgetCents),
    });
  }

  async listCampaignInsights(input: {
    accessToken: string;
    adAccountId: string;
    since: string;
    until: string;
    readMode?: MetaInsightReadMode;
  }): Promise<MetaCampaignInsight[]> {
    const payload = await this.listInsights({
      ...input,
      fields: "campaign_id,spend,impressions,clicks,actions",
      level: "campaign",
    });

    return payload
      .map((item) => ({
        campaignId: this.asString(item.campaign_id),
        spendCents: this.asMoneyCents(item.spend),
        impressions: this.asInteger(item.impressions),
        clicks: this.asInteger(item.clicks),
        metaConversationsStarted: this.messagingConversationStarted(
          item.actions,
          input.readMode,
        ),
      }))
      .filter((item): item is MetaCampaignInsight => Boolean(item.campaignId));
  }

  async listCampaignDailyInsights(input: {
    accessToken: string;
    adAccountId: string;
    since: string;
    until: string;
    readMode?: MetaInsightReadMode;
  }): Promise<MetaCampaignDailyInsight[]> {
    const payload = await this.listInsights({
      ...input,
      fields:
        "campaign_id,date_start,date_stop,spend,impressions,clicks,actions",
      level: "campaign",
      timeIncrement: 1,
    });

    return payload
      .map((item) => ({
        campaignId: this.asString(item.campaign_id),
        date: this.asString(item.date_start),
        spendCents: this.asMoneyCents(item.spend),
        impressions: this.asInteger(item.impressions),
        clicks: this.asInteger(item.clicks),
        metaConversationsStarted: this.messagingConversationStarted(
          item.actions,
          input.readMode,
        ),
      }))
      .filter((item): item is MetaCampaignDailyInsight =>
        Boolean(item.campaignId && item.date),
      );
  }

  async listAdSetInsights(input: {
    accessToken: string;
    adAccountId: string;
    since: string;
    until: string;
    readMode?: MetaInsightReadMode;
  }): Promise<MetaAdSetInsight[]> {
    const payload = await this.listInsights({
      ...input,
      fields: "campaign_id,adset_id,spend,impressions,clicks,actions",
      level: "adset",
    });

    return payload
      .map((item) => ({
        adSetId: this.asString(item.adset_id),
        campaignId: this.asString(item.campaign_id),
        spendCents: this.asMoneyCents(item.spend),
        impressions: this.asInteger(item.impressions),
        clicks: this.asInteger(item.clicks),
        metaConversationsStarted: this.messagingConversationStarted(
          item.actions,
          input.readMode,
        ),
      }))
      .filter((item): item is MetaAdSetInsight =>
        Boolean(item.adSetId && item.campaignId),
      );
  }

  async listAdInsights(input: {
    accessToken: string;
    adAccountId: string;
    since: string;
    until: string;
    readMode?: MetaInsightReadMode;
  }): Promise<MetaAdInsight[]> {
    const payload = await this.listInsights({
      ...input,
      fields: "campaign_id,adset_id,ad_id,spend,impressions,clicks,actions",
      level: "ad",
    });

    return payload
      .map((item) => ({
        adId: this.asString(item.ad_id),
        adSetId: this.asString(item.adset_id),
        campaignId: this.asString(item.campaign_id),
        spendCents: this.asMoneyCents(item.spend),
        impressions: this.asInteger(item.impressions),
        clicks: this.asInteger(item.clicks),
        metaConversationsStarted: this.messagingConversationStarted(
          item.actions,
          input.readMode,
        ),
      }))
      .filter((item): item is MetaAdInsight =>
        Boolean(item.adId && item.adSetId && item.campaignId),
      );
  }

  private getGraphApiVersion(): string {
    return this.env.META_GRAPH_API_VERSION ?? "v21.0";
  }

  private getScopes(): string[] {
    return (
      this.env.META_OAUTH_SCOPES ??
      "ads_read,ads_management,business_management,pages_show_list,pages_read_engagement"
    )
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

  private asHttpUrl(value: unknown): string | null {
    const candidate = this.asString(value);

    if (!candidate) {
      return null;
    }

    try {
      const url = new URL(candidate);
      return url.protocol === "http:" || url.protocol === "https:"
        ? candidate
        : null;
    } catch {
      return null;
    }
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  }

  private asPositiveInteger(value: unknown): number | null {
    return typeof value === "number" && Number.isInteger(value) && value > 0
      ? value
      : null;
  }

  private asInteger(value: unknown): number {
    const parsed =
      typeof value === "number"
        ? value
        : typeof value === "string"
          ? Number(value)
          : 0;

    return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
  }

  private asMoneyCents(value: unknown): number {
    const parsed =
      typeof value === "number"
        ? value
        : typeof value === "string"
          ? Number(value)
          : 0;

    return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
  }

  private asMinorCurrencyUnit(value: unknown): number | null {
    const parsed =
      typeof value === "number"
        ? value
        : typeof value === "string" && value.trim()
          ? Number(value)
          : Number.NaN;

    return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
  }

  private actionValue(
    actions: MetaInsightGraphNode["actions"],
    actionType: string,
  ): number {
    const action = actions?.find(
      (item) => this.asString(item.action_type) === actionType,
    );

    return this.asInteger(action?.value);
  }

  private messagingConversationStarted(
    actions: MetaInsightGraphNode["actions"],
    readMode: MetaInsightReadMode = "legacy",
  ): number {
    const legacyValue = this.actionValue(
      actions,
      "onsite_conversion.messaging_conversation_started_7d",
    );

    if (readMode === "legacy") {
      return legacyValue;
    }

    const compatibleValues = (actions ?? [])
      .filter((action) =>
        this.asString(action.action_type)
          ?.toLowerCase()
          .includes("messaging_conversation_started"),
      )
      .map((action) => this.asInteger(action.value));

    return Math.max(legacyValue, ...compatibleValues, 0);
  }

  private async listInsights(input: {
    accessToken: string;
    adAccountId: string;
    fields: string;
    level: "campaign" | "adset" | "ad";
    since: string;
    until: string;
    timeIncrement?: number;
    readMode?: MetaInsightReadMode;
  }): Promise<MetaInsightGraphNode[]> {
    const params = new URLSearchParams({
      fields: input.fields,
      level: input.level,
      limit: "100",
      time_range: JSON.stringify({
        since: input.since,
        until: input.until,
      }),
      access_token: input.accessToken,
    });

    if (input.timeIncrement) {
      params.set("time_increment", String(input.timeIncrement));
    }

    if (input.readMode === "manual") {
      params.set("action_breakdowns", "action_type");
      params.set("action_report_time", "conversion");
      params.set("use_unified_attribution_setting", "true");
    }
    const initialUrl = `https://graph.facebook.com/${this.getGraphApiVersion()}/${input.adAccountId}/insights?${params.toString()}`;

    return this.getGraphPages<MetaInsightGraphNode>(
      initialUrl,
      `/${input.adAccountId}/insights?level=${input.level}`,
    );
  }

  private async getGraphList<T>(
    path: string,
    fields: string,
    accessToken: string,
  ): Promise<T[]> {
    const params = new URLSearchParams({
      fields,
      limit: "100",
      access_token: accessToken,
    });
    const initialUrl = `https://graph.facebook.com/${this.getGraphApiVersion()}${path}?${params.toString()}`;

    return this.getGraphPages<T>(initialUrl, path);
  }

  private async getGraphObject<T>(
    path: string,
    fields: string,
    accessToken: string,
  ): Promise<T> {
    const params = new URLSearchParams({ fields, access_token: accessToken });
    const response = await this.fetchImpl(
      `https://graph.facebook.com/${this.getGraphApiVersion()}${path}?${params.toString()}`,
    );
    const payload = (await response
      .json()
      .catch(() => ({}))) as MetaGraphObjectResponse;

    if (!response.ok) {
      throw new Error(
        this.asString(payload.error?.message) ??
          `Meta Graph HTTP ${response.status}`,
      );
    }

    return payload as T;
  }

  private async getCreativePreviewUrls(
    creativeIds: string[],
    accessToken: string,
  ): Promise<Map<string, string>> {
    if (creativeIds.length === 0) {
      return new Map();
    }

    const creativeFields = [
      "id",
      "thumbnail_url",
      "image_url",
      "video_id",
      "object_story_spec",
      "asset_feed_spec",
    ].join(",");
    const creatives = await this.getGraphBatch<MetaCreativeGraphNode>(
      creativeIds.map((creativeId) => {
        const params = new URLSearchParams({
          fields: creativeFields,
          thumbnail_width: "1200",
          thumbnail_height: "1200",
        });

        return {
          key: creativeId,
          relativeUrl: `${creativeId}?${params.toString()}`,
        };
      }),
      accessToken,
      "/creative-previews",
    );
    const videoIds = [
      ...new Set(
        [...creatives.values()]
          .map((creative) => this.creativeVideoId(creative))
          .filter((videoId): videoId is string => Boolean(videoId)),
      ),
    ];
    const videoThumbnailPayloads = await this.getGraphBatch<
      MetaGraphListResponse<MetaVideoThumbnailGraphNode>
    >(
      videoIds.map((videoId) => {
        const params = new URLSearchParams({
          fields: "uri,width,height,is_preferred",
          limit: "100",
        });

        return {
          key: videoId,
          relativeUrl: `${videoId}/thumbnails?${params.toString()}`,
        };
      }),
      accessToken,
      "/video-thumbnails",
    );
    const videoPreviewUrls = new Map<string, string>();

    for (const [videoId, payload] of videoThumbnailPayloads) {
      const thumbnailUrl = this.largestVideoThumbnailUrl(payload.data);

      if (thumbnailUrl) {
        videoPreviewUrls.set(videoId, thumbnailUrl);
      }
    }

    const previewUrls = new Map<string, string>();

    for (const [creativeId, creative] of creatives) {
      const previewUrl = this.creativePreviewUrl(creative, videoPreviewUrls);

      if (previewUrl) {
        previewUrls.set(creativeId, previewUrl);
      }
    }

    return previewUrls;
  }

  private creativePreviewUrl(
    creative: MetaCreativeGraphNode,
    videoPreviewUrls: Map<string, string>,
  ): string | null {
    const videoId = this.creativeVideoId(creative);
    const videoPreviewUrl = videoId ? videoPreviewUrls.get(videoId) : null;

    if (videoPreviewUrl) {
      return videoPreviewUrl;
    }

    const candidates = [
      creative.image_url,
      creative.object_story_spec?.video_data?.image_url,
      creative.object_story_spec?.link_data?.image_url,
      ...(creative.object_story_spec?.link_data?.child_attachments ?? []).map(
        (attachment) => attachment.image_url,
      ),
      ...(creative.asset_feed_spec?.images ?? []).map((image) => image.url),
      ...(creative.asset_feed_spec?.videos ?? []).map(
        (video) => video.thumbnail_url,
      ),
      creative.thumbnail_url,
    ];

    for (const candidate of candidates) {
      const url = this.asHttpUrl(candidate);

      if (url) {
        return url;
      }
    }

    return null;
  }

  private creativeVideoId(creative: MetaCreativeGraphNode): string | null {
    const candidates = [
      creative.video_id,
      creative.object_story_spec?.video_data?.video_id,
      ...(creative.object_story_spec?.link_data?.child_attachments ?? []).map(
        (attachment) => attachment.video_id,
      ),
      ...(creative.asset_feed_spec?.videos ?? []).map(
        (video) => video.video_id,
      ),
    ];

    for (const candidate of candidates) {
      const videoId = this.asString(candidate);

      if (videoId) {
        return videoId;
      }
    }

    return null;
  }

  private largestVideoThumbnailUrl(
    thumbnails: MetaVideoThumbnailGraphNode[] | undefined,
  ): string | null {
    const candidates = (thumbnails ?? [])
      .map((thumbnail) => ({
        area:
          this.asInteger(thumbnail.width) * this.asInteger(thumbnail.height),
        preferred: thumbnail.is_preferred === true,
        url: this.asHttpUrl(thumbnail.uri),
      }))
      .filter((thumbnail): thumbnail is typeof thumbnail & { url: string } =>
        Boolean(thumbnail.url),
      )
      .sort(
        (left, right) =>
          right.area - left.area ||
          Number(right.preferred) - Number(left.preferred),
      );

    return candidates[0]?.url ?? null;
  }

  private async getGraphBatch<T>(
    requests: Array<{ key: string; relativeUrl: string }>,
    accessToken: string,
    operation: string,
  ): Promise<Map<string, T>> {
    const startedAt = Date.now();
    const results = new Map<string, T>();
    let batchCount = 0;

    try {
      for (let offset = 0; offset < requests.length; offset += 50) {
        const chunk = requests.slice(offset, offset + 50);
        batchCount += 1;
        const body = new URLSearchParams({
          access_token: accessToken,
          batch: JSON.stringify(
            chunk.map((request) => ({
              method: "GET",
              relative_url: request.relativeUrl,
            })),
          ),
        });
        const response = await this.fetchImpl(
          `https://graph.facebook.com/${this.getGraphApiVersion()}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body,
          },
        );
        const payload = (await response.json().catch(() => null)) as unknown;

        if (!response.ok || !Array.isArray(payload)) {
          const errorPayload = this.asRecord(payload);
          const error = this.asRecord(errorPayload?.error);

          throw new Error(
            this.asString(error?.message) ??
              `Meta Graph batch HTTP ${response.status}`,
          );
        }

        chunk.forEach((request, index) => {
          const item = this.asRecord(
            payload[index],
          ) as MetaGraphBatchItem | null;
          const code = this.asInteger(item?.code);

          if (code < 200 || code >= 300) {
            return;
          }

          const parsedBody = this.parseGraphBatchBody<T>(item?.body);

          if (parsedBody) {
            results.set(request.key, parsedBody);
          }
        });
      }

      return results;
    } finally {
      this.logSlowGraphList(
        operation,
        Date.now() - startedAt,
        batchCount,
        results.size,
      );
    }
  }

  private parseGraphBatchBody<T>(body: unknown): T | null {
    let parsed = body;

    if (typeof body === "string") {
      try {
        parsed = JSON.parse(body) as unknown;
      } catch {
        return null;
      }
    }

    return this.asRecord(parsed) ? (parsed as T) : null;
  }

  private async postGraphUpdate(
    id: string,
    accessToken: string,
    values: Record<string, string>,
  ): Promise<void> {
    const body = new URLSearchParams({
      ...values,
      access_token: accessToken,
    });
    const response = await this.fetchImpl(
      `https://graph.facebook.com/${this.getGraphApiVersion()}/${id}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      },
    );
    const payload = (await response
      .json()
      .catch(() => ({}))) as MetaGraphMutationResponse;

    if (!response.ok || payload.success !== true) {
      throw new Error(
        this.asString(payload.error?.message) ??
          `Meta Graph HTTP ${response.status}`,
      );
    }
  }

  private async getGraphPages<T>(
    initialUrl: string,
    operation: string,
  ): Promise<T[]> {
    const startedAt = Date.now();
    let nextUrl: string | null = initialUrl;
    const data: T[] = [];
    let pageCount = 0;

    try {
      for (let page = 0; nextUrl && page < 100; page += 1) {
        pageCount = page + 1;
        const response = await this.fetchImpl(nextUrl);
        const payload = (await response
          .json()
          .catch(() => ({}))) as MetaGraphListResponse<T>;

        if (!response.ok) {
          throw new Error(
            this.asString(payload.error?.message) ??
              `Meta Graph HTTP ${response.status}`,
          );
        }

        if (Array.isArray(payload.data)) {
          data.push(...payload.data);
        }

        nextUrl = this.asString(payload.paging?.next);
      }

      if (nextUrl) {
        throw new Error(
          `Meta Graph pagination exceeded 100 pages for ${operation}`,
        );
      }

      return data;
    } finally {
      this.logSlowGraphList(
        operation,
        Date.now() - startedAt,
        pageCount,
        data.length,
      );
    }
  }

  private logSlowGraphList(
    path: string,
    durationMs: number,
    pageCount: number,
    itemCount: number,
  ): void {
    const thresholdMs = Number(this.env.META_GRAPH_SLOW_LOG_MS ?? 1500);

    if (!Number.isFinite(thresholdMs) || durationMs < thresholdMs) {
      return;
    }

    console.warn("[wpptrack:meta-graph] slow list", {
      path,
      durationMs,
      pageCount,
      itemCount,
    });
  }
}
