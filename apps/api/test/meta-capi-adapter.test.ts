import { describe, expect, it, vi } from "vitest";
import {
  MetaCapiAdapter,
  type MetaCapiSendEventInput
} from "../src/conversion-events/meta-capi.adapter";

type FetchLike = (
  url: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;
type FetchMock = ReturnType<typeof vi.fn<FetchLike>>;

function baseInput(
  overrides: Partial<MetaCapiSendEventInput> = {}
): MetaCapiSendEventInput {
  return {
    accessToken: null,
    pixelId: "pixel_1",
    pageId: "page_1",
    eventName: "QualifiedLead",
    dedupeKey: "workspace_1:lead_1:rule_1:QualifiedLead:ad_1",
    phoneHash: "phone_hash",
    adId: "ad_1",
    ctwaClid: "ctwa_1",
    valueCents: null,
    currency: null,
    contentName: null,
    customData: null,
    testEventCode: null,
    ...overrides
  };
}

function successfulFetchMock(): FetchMock {
  return vi.fn(async () => {
    return new Response(
      JSON.stringify({
        events_received: 1,
        messages: []
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  });
}

function parseRequestBody(fetchMock: FetchMock) {
  const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;

  return JSON.parse(String(init?.body));
}

describe("meta capi adapter", () => {
  it("sends whatsapp messaging channel and ctwa user data through the builder", async () => {
    const fetchMock = successfulFetchMock();
    const adapter = new MetaCapiAdapter(
      {
        META_CAPI_ACCESS_TOKEN: "meta-token",
        META_GRAPH_API_VERSION: "v21.0"
      },
      fetchMock as never
    );

    const result = await adapter.sendEvent(baseInput());

    expect(result).toMatchObject({
      status: "sent",
      errorMessage: null,
      errorCode: null
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "https://graph.facebook.com/v21.0/pixel_1/events?access_token=meta-token"
    );
    const body = parseRequestBody(fetchMock);
    expect(result.requestPayload).toEqual(body);
    expect(body.data[0]).toMatchObject({
      event_name: "QualifiedLead",
      event_id: "workspace_1:lead_1:rule_1:QualifiedLead:ad_1",
      action_source: "business_messaging",
      messaging_channel: "whatsapp",
      user_data: {
        ph: ["phone_hash"],
        ctwa_clid: "ctwa_1",
        page_id: "page_1"
      },
      custom_data: {
        ad_id: "ad_1"
      }
    });
  });

  it.each([
    {
      name: "ctwa clid",
      overrides: { ctwaClid: null },
      errorCode: "MissingCtwaClid"
    },
    {
      name: "access token",
      env: {},
      overrides: { accessToken: null },
      errorCode: "MissingAccessToken"
    },
    {
      name: "pixel/page destination",
      overrides: { pixelId: null },
      errorCode: "MissingMetaDestination"
    },
    {
      name: "page destination",
      overrides: { pageId: null },
      errorCode: "MissingMetaDestination"
    },
    {
      name: "phone hash",
      overrides: { phoneHash: null },
      errorCode: "MissingPhoneHash"
    },
    {
      name: "ad id",
      overrides: { adId: null },
      errorCode: "MissingAdId"
    }
  ])(
    "returns $errorCode and does not call fetch when $name is missing",
    async ({ env, overrides, errorCode }) => {
      const fetchMock = successfulFetchMock();
      const adapter = new MetaCapiAdapter(
        env ?? {
          META_CAPI_ACCESS_TOKEN: "meta-token"
        },
        fetchMock as never
      );

      const result = await adapter.sendEvent(baseInput(overrides));

      expect(result).toMatchObject({
        status: "not_configured",
        requestPayload: null,
        responseSummary: null,
        errorCode
      });
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it("includes test_event_code when provided", async () => {
    const fetchMock = successfulFetchMock();
    const adapter = new MetaCapiAdapter(
      {
        META_CAPI_ACCESS_TOKEN: "meta-token"
      },
      fetchMock as never
    );

    await adapter.sendEvent(baseInput({ testEventCode: "TEST123" }));

    expect(parseRequestBody(fetchMock)).toMatchObject({
      test_event_code: "TEST123"
    });
  });

  it("includes purchase value, currency, content name, and custom data when provided", async () => {
    const fetchMock = successfulFetchMock();
    const adapter = new MetaCapiAdapter(
      {
        META_CAPI_ACCESS_TOKEN: "meta-token"
      },
      fetchMock as never
    );

    await adapter.sendEvent(
      baseInput({
        eventName: "Purchase",
        dedupeKey: "purchase_event_1",
        valueCents: 12345,
        currency: "BRL",
        contentName: "Plano Pro",
        customData: {
          contents: [
            {
              id: "plan_pro",
              quantity: 2,
              item_price: 61.725
            }
          ]
        }
      })
    );

    const body = parseRequestBody(fetchMock);
    expect(body.data[0]).toMatchObject({
      event_name: "Purchase",
      custom_data: {
        ad_id: "ad_1",
        value: 123.45,
        currency: "BRL",
        content_name: "Plano Pro",
        order_id: "purchase_event_1",
        content_type: "product",
        contents: [
          {
            id: "plan_pro",
            quantity: 2,
            item_price: 61.725
          }
        ],
        num_items: 2
      }
    });
  });

  it("maps non-OK Meta responses to MetaCapiRejected", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          error: {
            message: "Invalid parameter",
            code: 100
          }
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    });
    const adapter = new MetaCapiAdapter(
      {
        META_CAPI_ACCESS_TOKEN: "meta-token"
      },
      fetchMock as never
    );

    const result = await adapter.sendEvent(baseInput());

    expect(result).toEqual({
      status: "error",
      requestPayload: expect.objectContaining({
        data: expect.any(Array)
      }),
      responseSummary: {
        error: {
          message: "Invalid parameter",
          code: 100
        }
      },
      errorMessage: "Meta CAPI request failed",
      errorCode: "MetaCapiRejected"
    });
  });

  it("maps thrown fetch errors to MetaCapiNetworkError", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("socket hang up");
    });
    const adapter = new MetaCapiAdapter(
      {
        META_CAPI_ACCESS_TOKEN: "meta-token"
      },
      fetchMock as never
    );

    const result = await adapter.sendEvent(baseInput());

    expect(result).toMatchObject({
      status: "error",
      requestPayload: expect.objectContaining({
        data: expect.any(Array)
      }),
      responseSummary: null,
      errorMessage: "Meta CAPI network request failed",
      errorCode: "MetaCapiNetworkError"
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not expose access tokens from thrown fetch errors", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error(
        "failed https://graph.facebook.com/v24.0/pixel/events?access_token=secret-token"
      );
    });
    const adapter = new MetaCapiAdapter(
      {
        META_CAPI_ACCESS_TOKEN: "secret-token"
      },
      fetchMock as never
    );

    const result = await adapter.sendEvent(baseInput());
    const serializedResult = JSON.stringify(result);

    expect(result).toMatchObject({
      status: "error",
      responseSummary: null,
      errorMessage: "Meta CAPI network request failed",
      errorCode: "MetaCapiNetworkError"
    });
    expect(serializedResult).not.toContain("secret-token");
    expect(serializedResult).not.toContain("access_token=secret-token");
  });
});
