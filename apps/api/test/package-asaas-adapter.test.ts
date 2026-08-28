import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceBillingProfile } from "@prisma/client";
import { PackageAsaasAdapter } from "../src/billing/package-asaas.adapter";

function response(status: number, payload: unknown = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function createAdapter() {
  return new PackageAsaasAdapter({
    asaasApiKey: () => "test_key",
    asaasApiUrl: () => "https://asaas.example.test/v3",
    checkoutSuccessUrl: () => "https://app.example.test/success",
    checkoutCancelUrl: () => "https://app.example.test/cancel",
  } as never);
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("PackageAsaasAdapter", () => {
  it("creates an exact R$30 additive payment without creating a subscription", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response(200, {
        id: "payment_1",
        invoiceUrl: "https://asaas.example.test/pay/payment_1",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createAdapter().createAdditivePayment({
        customerId: "customer_1",
        workspaceId: "workspace_1",
        subscriptionId: "contract_1",
        itemId: "item_1",
        amountCents: 3000,
        description: "Numero WhatsApp adicional — R$ 30,00",
      }),
    ).resolves.toEqual({
      id: "payment_1",
      invoiceUrl: "https://asaas.example.test/pay/payment_1",
    });

    const request = JSON.parse(
      String(fetchMock.mock.calls[0]?.[1]?.body),
    ) as Record<string, unknown>;
    expect(request).toMatchObject({
      customer: "customer_1",
      value: 30,
      externalReference: "wpptrack:additive:workspace_1:contract_1:item_1",
    });
    expect(request).not.toHaveProperty("subscription");
  });

  it("uses the hosted checkout customerData contract", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response(200, {
        id: "checkout_1",
        link: "https://asaas.example.test/checkout_1",
        status: "ACTIVE",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await createAdapter().createRecurringCheckout({
      workspaceId: "workspace_1",
      subscriptionId: "contract_1",
      planName: "Pacote 3",
      monthlyPriceCents: 5000,
      customerCityId: 3550308,
      profile: {
        payerName: "Cliente Teste",
        taxId: "123.456.789-09",
        billingEmail: "billing@example.test",
        phone: "+55 (11) 99999-9999",
        addressLine: "Rua A",
        addressNumber: "10",
        addressComplement: "Sala 1",
        postalCode: "01001-000",
        district: "Centro",
      } as WorkspaceBillingProfile,
    });

    const request = JSON.parse(
      String(fetchMock.mock.calls[0]?.[1]?.body),
    ) as Record<string, unknown>;
    expect(request.billingTypes).toEqual(["CREDIT_CARD"]);
    expect(request.chargeTypes).toEqual(["RECURRENT"]);
    expect(request).not.toHaveProperty("customer");
    expect(request.customerData).toEqual({
      name: "Cliente Teste",
      cpfCnpj: "12345678909",
      email: "billing@example.test",
      phone: "5511999999999",
      address: "Rua A",
      addressNumber: "10",
      complement: "Sala 1",
      postalCode: "01001000",
      province: "Centro",
      city: 3550308,
    });
  });

  it("keeps the Asaas city identifier returned with the customer", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        response(200, {
          id: "customer_1",
          city: 3550308,
        }),
      ),
    );

    await expect(
      createAdapter().createCustomer("workspace_1", {
        payerName: "Cliente Teste",
        taxId: "12345678909",
        billingEmail: "billing@example.test",
        phone: "5511999999999",
        addressLine: "Rua A",
        addressNumber: "10",
        addressComplement: null,
        postalCode: "01001000",
        district: "Centro",
      } as WorkspaceBillingProfile),
    ).resolves.toEqual({
      id: "customer_1",
      cityId: 3550308,
    });
  });

  it("finds the exact customer by workspace external reference", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response(200, {
        data: [
          {
            id: "customer_other",
            city: 3550308,
            externalReference: "wpptrack:workspace:other",
          },
          {
            id: "customer_1",
            city: 3550308,
            externalReference: "wpptrack:workspace:workspace_1",
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      createAdapter().findCustomerByExternalReference("workspace_1"),
    ).resolves.toEqual({
      id: "customer_1",
      cityId: 3550308,
    });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(
      "externalReference=wpptrack%3Aworkspace%3Aworkspace_1",
    );
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
      taxes: {},
    });

    expect(fetchMock.mock.calls.map((call) => call[1]?.method)).toEqual([
      "GET",
      "POST",
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
      taxes: {},
    });

    expect(fetchMock.mock.calls.map((call) => call[1]?.method)).toEqual([
      "GET",
      "PUT",
    ]);
  });

  it("treats an already removed subscription as canceled", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(response(404, { errors: [{ code: "not_found" }] })),
    );

    await expect(
      createAdapter().removeSubscription("subscription_1"),
    ).resolves.toBeUndefined();
  });

  it("keeps non-404 provider errors visible", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        response(500, {
          errors: [
            {
              code: "unavailable",
              description: "Provider temporarily unavailable",
            },
          ],
        }),
      ),
    );

    await expect(
      createAdapter().removeSubscription("subscription_1"),
    ).rejects.toMatchObject({
      code: "asaas_unavailable",
      statusCode: 500,
      retryable: true,
      description: "Provider temporarily unavailable",
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
            { once: true },
          );
        });
      }),
    );

    const request = createAdapter().removeSubscription("subscription_1");
    const result = expect(request).rejects.toMatchObject({
      code: "asaas_timeout",
      statusCode: null,
      retryable: true,
    });

    await vi.advanceTimersByTimeAsync(15_000);
    await result;
  });
});
