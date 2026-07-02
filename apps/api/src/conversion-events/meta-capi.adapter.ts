type MetaCapiEnv = Record<string, string | undefined>;
type Fetcher = typeof fetch;

export type MetaCapiSendEventInput = {
  pixelId: string | null;
  eventName: string;
  dedupeKey: string;
  phoneHash: string | null;
  adId: string | null;
};

export type MetaCapiSendEventResult = {
  status: "not_configured" | "sent" | "error";
  responseSummary: Record<string, unknown> | null;
  errorMessage: string | null;
};

export class MetaCapiAdapter {
  constructor(
    private readonly env: MetaCapiEnv = process.env,
    private readonly fetcher: Fetcher = fetch
  ) {}

  async sendEvent(
    input: MetaCapiSendEventInput
  ): Promise<MetaCapiSendEventResult> {
    const accessToken = this.env.META_CAPI_ACCESS_TOKEN;

    if (!accessToken || !input.pixelId) {
      return {
        status: "not_configured",
        responseSummary: null,
        errorMessage: "Meta CAPI token or pixel id not configured"
      };
    }

    const version = this.env.META_GRAPH_API_VERSION ?? "v21.0";
    const url = new URL(
      `https://graph.facebook.com/${version}/${input.pixelId}/events`
    );
    url.searchParams.set("access_token", accessToken);

    const response = await this.fetcher(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        data: [
          {
            event_name: input.eventName,
            event_time: Math.floor(Date.now() / 1000),
            event_id: input.dedupeKey,
            action_source: "business_messaging",
            user_data: this.buildUserData(input),
            custom_data: {
              ad_id: input.adId
            }
          }
        ]
      })
    });
    const payload = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;

    if (!response.ok) {
      return {
        status: "error",
        responseSummary: payload,
        errorMessage: "Meta CAPI request failed"
      };
    }

    return {
      status: "sent",
      responseSummary: payload,
      errorMessage: null
    };
  }

  private buildUserData(input: MetaCapiSendEventInput): Record<string, unknown> {
    return input.phoneHash
      ? {
          ph: [input.phoneHash]
        }
      : {};
  }
}
