type AsaasEnv = Record<string, string | undefined>;
type Fetcher = typeof fetch;

export type AsaasSplitReceiverInput = {
  walletId: string;
  percentageBps: number;
};

export type AsaasPaymentInput = {
  customerId: string | null;
  localChargeId: string;
  amountCents: number;
  description: string;
  splitReceivers: AsaasSplitReceiverInput[];
};

export type AsaasPaymentResult = {
  status: "not_configured" | "created";
  externalChargeId: string | null;
  checkoutUrl: string | null;
};

export class AsaasAdapter {
  constructor(
    private readonly env: AsaasEnv = process.env,
    private readonly fetcher: Fetcher = fetch
  ) {}

  async createPayment(input: AsaasPaymentInput): Promise<AsaasPaymentResult> {
    const baseUrl = this.env.ASAAS_BASE_URL?.replace(/\/$/, "");
    const apiKey = this.env.ASAAS_API_KEY;

    if (!baseUrl || !apiKey || !input.customerId) {
      return {
        status: "not_configured",
        externalChargeId: null,
        checkoutUrl: null
      };
    }

    const response = await this.fetcher(`${baseUrl}/payments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "WppTrack SaaS (Node.js)",
        access_token: apiKey
      },
      body: JSON.stringify({
        customer: input.customerId,
        billingType: "UNDEFINED",
        value: centsToMoney(input.amountCents),
        dueDate: formatDate(new Date()),
        description: input.description,
        externalReference: input.localChargeId,
        split: input.splitReceivers.map((receiver) => ({
          walletId: receiver.walletId,
          percentualValue: bpsToPercent(receiver.percentageBps)
        }))
      })
    });

    if (!response.ok) {
      return {
        status: "not_configured",
        externalChargeId: null,
        checkoutUrl: null
      };
    }

    const payload = (await response.json()) as Record<string, unknown>;

    return {
      status: "created",
      externalChargeId: firstString(payload.id) ?? null,
      checkoutUrl:
        firstString(payload.invoiceUrl) ??
        firstString(payload.bankSlipUrl) ??
        null
    };
  }
}

function centsToMoney(value: number): number {
  return Number((value / 100).toFixed(2));
}

function bpsToPercent(value: number): number {
  return Number((value / 100).toFixed(2));
}

function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function firstString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}
