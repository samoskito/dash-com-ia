import { afterEach, describe, expect, it, vi } from "vitest";
import { AsaasAdapter } from "../src/billing/asaas.adapter";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("asaas adapter", () => {
  it("reports not_configured without API credentials or customer id", async () => {
    const adapter = new AsaasAdapter({}, fetch);

    const result = await adapter.createPayment({
      customerId: null,
      localChargeId: "charge_1",
      amountCents: 12900,
      description: "Ativacao da instancia WhatsApp Comercial",
      splitReceivers: []
    });

    expect(result).toEqual({
      status: "not_configured",
      externalChargeId: null,
      checkoutUrl: null
    });
  });

  it("creates an undefined-payment charge with percentage split", async () => {
    let requestedUrl = "";
    let requestedInit: RequestInit | undefined;
    const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      requestedUrl = String(url);
      requestedInit = init;

      return new Response(
        JSON.stringify({
          id: "pay_asaas_1",
          invoiceUrl: "https://sandbox.asaas.com/i/pay_asaas_1"
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    });
    const adapter = new AsaasAdapter(
      {
        ASAAS_BASE_URL: "https://api-sandbox.asaas.com/v3",
        ASAAS_API_KEY: "$aact_hmlg_secret"
      },
      fetchMock as never
    );

    const result = await adapter.createPayment({
      customerId: "cus_asaas_1",
      localChargeId: "charge_1",
      amountCents: 12900,
      description: "Ativacao da instancia WhatsApp Comercial",
      splitReceivers: [
        {
          walletId: "wallet_1",
          percentageBps: 2500
        },
        {
          walletId: "wallet_2",
          percentageBps: 1500
        }
      ]
    });

    expect(result).toEqual({
      status: "created",
      externalChargeId: "pay_asaas_1",
      checkoutUrl: "https://sandbox.asaas.com/i/pay_asaas_1"
    });
    expect(requestedUrl).toBe("https://api-sandbox.asaas.com/v3/payments");
    expect(requestedInit).toMatchObject({
      method: "POST",
      headers: expect.objectContaining({
        access_token: "$aact_hmlg_secret",
        "Content-Type": "application/json"
      })
    });
    const body = JSON.parse(String(requestedInit?.body));
    expect(body).toMatchObject({
      customer: "cus_asaas_1",
      billingType: "UNDEFINED",
      value: 129,
      description: "Ativacao da instancia WhatsApp Comercial",
      externalReference: "charge_1",
      split: [
        {
          walletId: "wallet_1",
          percentualValue: 25
        },
        {
          walletId: "wallet_2",
          percentualValue: 15
        }
      ]
    });
    expect(body.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
