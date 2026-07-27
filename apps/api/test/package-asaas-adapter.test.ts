import { afterEach, describe, expect, it, vi } from "vitest";
import { PackageAsaasAdapter } from "../src/billing/package-asaas.adapter";

function response(status: number, payload: unknown = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function createAdapter() {
  return new PackageAsaasAdapter({
    asaasApiKey: () => "test_key",
    asaasApiUrl: () => "https://asaas.example.test/v3",
    checkoutSuccessUrl: () => "https://app.example.test/success",
    checkoutCancelUrl: () => "https://app.example.test/cancel"
  } as never);
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("PackageAsaasAdapter", () => {
  it("reuses the customer created for the workspace checkout", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response(200, {
        id: "checkout_1",
        link: "https://asaas.example.test/checkout_1",
        status: "ACTIVE"
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await createAdapter().createRecurringCheckout({
      workspaceId: "workspace_1",
      subscriptionId: "contract_1",
      planName: "Pacote 3",
      monthlyPriceCents: 5000,
      customerId: "customer_1"
    });

    const request = JSON.parse(
      String(fetchMock.mock.calls[0]?.[1]?.body)
    ) as Record<string, unknown>;
    expect(request.customer).toBe("customer_1");
    expect(request).not.toHaveProperty("customerData");
  });

  it("creates invoice settings only when the subscription has none", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(404, { errors: [{ code: "not_found" }] }))
      .mockResolvedValueOnce(response(200, { id: "settings_1" }));
    vi.stubGlobal("fetch", fetchMock);

    await createAdapter().upsertAutomaticInvoiceSettings({
      asaasSubscriptionId: "subscription_1",
      municipalServiceId: "service_1",
      municipalServiceCode: null,
      observations: null,
      taxes: {}
    });

    expect(fetchMock.mock.calls.map((call) => call[1]?.method)).toEqual([
      "GET",
      "POST"
    ]);
  });

  it("updates existing invoice settings instead of creating duplicates", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(200, { id: "settings_1" }))
      .mockResolvedValueOnce(response(200, { id: "settings_1" }));
    vi.stubGlobal("fetch", fetchMock);

    await createAdapter().upsertAutomaticInvoiceSettings({
      asaasSubscriptionId: "subscription_1",
      municipalServiceId: "service_1",
      municipalServiceCode: null,
      observations: null,
      taxes: {}
    });

    expect(fetchMock.mock.calls.map((call) => call[1]?.method)).toEqual([
      "GET",
      "PUT"
    ]);
  });

  it("treats an already removed subscription as canceled", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        response(404, { errors: [{ code: "not_found" }] })
      )
    );

    await expect(
      createAdapter().removeSubscription("subscription_1")
    ).resolves.toBeUndefined();
  });

  it("keeps non-404 provider errors visible", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        response(500, { errors: [{ code: "unavailable" }] })
      )
    );

    await expect(
      createAdapter().removeSubscription("subscription_1")
    ).rejects.toMatchObject({
      code: "asaas_unavailable",
      statusCode: 500,
      retryable: true
    });
  });

  it("aborts provider requests after the bounded timeout", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((_url: string, init: RequestInit) => {
        return new Promise((_resolve, reject) => {
          init.signal?.addEventListener(
            "abort",
            () => {
              const error = new Error("aborted");
              error.name = "AbortError";
              reject(error);
            },
            { once: true }
          );
        });
      })
    );

    const request = createAdapter().removeSubscription("subscription_1");
    const result = expect(request).rejects.toMatchObject({
      code: "asaas_timeout",
      statusCode: null,
      retryable: true
    });

    await vi.advanceTimersByTimeAsync(15_000);
    await result;
  });
});
