import { describe, expect, it } from "vitest";
import { BillingService } from "../src/billing/billing.service";
import type { AsaasAdapter } from "../src/billing/asaas.adapter";

type FakePrisma = {
  whatsappInstance: {
    count: (args: unknown) => Promise<number>;
    create: (args: unknown) => Promise<Record<string, unknown>>;
    update: (args: unknown) => Promise<Record<string, unknown>>;
  };
  whatsappInstanceActivation: {
    create: (args: unknown) => Promise<Record<string, unknown>>;
    update: (args: unknown) => Promise<Record<string, unknown>>;
  };
  paymentCharge: {
    create: (args: unknown) => Promise<Record<string, unknown>>;
    findFirst: (args: unknown) => Promise<Record<string, unknown> | null>;
    update: (args: unknown) => Promise<Record<string, unknown>>;
  };
  splitReceiver: {
    findMany: (args: unknown) => Promise<Array<Record<string, unknown>>>;
  };
  workspace: {
    findUnique: (args: unknown) => Promise<Record<string, unknown> | null>;
  };
  workspaceSubscription: {
    findFirst: (args: unknown) => Promise<Record<string, unknown> | null>;
  };
  $transaction: <T>(callback: (tx: FakePrisma) => Promise<T>) => Promise<T>;
};

function createHarness(asaasAdapter?: Pick<AsaasAdapter, "createPayment">) {
  const db = {
    instances: [] as Array<Record<string, unknown>>,
    charges: [] as Array<Record<string, unknown>>,
    activations: [] as Array<Record<string, unknown>>,
    splitReceivers: [] as Array<Record<string, unknown>>,
    subscriptions: [] as Array<Record<string, unknown>>,
    workspaces: [
      {
        id: "workspace_1",
        asaasCustomerId: null
      }
    ] as Array<Record<string, unknown>>
  };
  const prisma: FakePrisma = {
    workspace: {
      findUnique: async (args) => {
        const { where } = args as { where: { id: string } };
        return (
          db.workspaces.find((workspace) => workspace.id === where.id) ?? null
        );
      }
    },
    workspaceSubscription: {
      findFirst: async (args) => {
        const { where } = args as { where: { workspaceId: string } };
        return (
          db.subscriptions.find(
            (subscription) => subscription.workspaceId === where.workspaceId
          ) ?? null
        );
      }
    },
    whatsappInstance: {
      count: async (args) => {
        const { where } = args as { where: Record<string, unknown> };
        return db.instances.filter(
          (instance) =>
            instance.workspaceId === where.workspaceId &&
            instance.status === where.status
        ).length;
      },
      create: async (args) => {
        const { data } = args as { data: Record<string, unknown> };
        const instance = {
          id: `wpp_${db.instances.length + 1}`,
          ...data
        };
        db.instances.push(instance);
        return instance;
      },
      update: async (args) => {
        const { data, where } = args as {
          data: Record<string, unknown>;
          where: { id: string };
        };
        const index = db.instances.findIndex(
          (instance) => instance.id === where.id
        );
        db.instances[index] = {
          ...db.instances[index],
          ...data
        };
        return db.instances[index];
      }
    },
    paymentCharge: {
      create: async (args) => {
        const { data } = args as { data: Record<string, unknown> };
        const charge = {
          id: `charge_${db.charges.length + 1}`,
          ...data
        };
        db.charges.push(charge);
        return charge;
      },
      findFirst: async (args) => {
        const { where } = args as {
          where: { OR: Array<Record<string, unknown>> };
        };
        const charge =
          db.charges.find((item) =>
            where.OR.some((condition) =>
              Object.entries(condition).every(
                ([key, value]) => item[key] === value
              )
            )
          ) ?? null;

        if (!charge) {
          return null;
        }

        return {
          ...charge,
          activation:
            db.activations.find(
              (activation) => activation.paymentChargeId === charge.id
            ) ?? null
        };
      },
      update: async (args) => {
        const { data, where } = args as {
          data: Record<string, unknown>;
          where: { id: string };
        };
        const index = db.charges.findIndex((charge) => charge.id === where.id);
        db.charges[index] = {
          ...db.charges[index],
          ...data
        };
        return db.charges[index];
      }
    },
    splitReceiver: {
      findMany: async (args) => {
        const { where } = args as { where: Record<string, unknown> };
        return db.splitReceivers.filter(
          (receiver) => receiver.active === where.active
        );
      }
    },
    whatsappInstanceActivation: {
      create: async (args) => {
        const { data } = args as { data: Record<string, unknown> };
        const activation = {
          id: `activation_${db.activations.length + 1}`,
          ...data
        };
        db.activations.push(activation);
        return activation;
      },
      update: async (args) => {
        const { data, where } = args as {
          data: Record<string, unknown>;
          where: { id: string };
        };
        const index = db.activations.findIndex(
          (activation) => activation.id === where.id
        );
        db.activations[index] = {
          ...db.activations[index],
          ...data
        };
        return db.activations[index];
      }
    },
    $transaction: async <T>(callback: (tx: typeof prisma) => Promise<T>) =>
      callback(prisma)
  };

  return {
    db,
    service: new BillingService(
      prisma as never,
      (asaasAdapter ?? {
        createPayment: async () => ({
          status: "not_configured" as const,
          externalChargeId: null,
          checkoutUrl: null
        })
      }) as never,
      {
        WPPTRACK_WHATSAPP_INSTANCE_PRICE_CENTS: "12900"
      }
    )
  };
}

describe("billing service", () => {
  it("quotes the next WhatsApp instance with fixed upfront price", async () => {
    const { service } = createHarness();

    const quote = await service.getWhatsappInstanceQuote("workspace_1");

    expect(quote).toEqual({
      workspaceId: "workspace_1",
      activeInstances: 0,
      pricePerInstanceCents: 12900,
      nextInstanceAmountCents: 12900,
      currency: "BRL"
    });
  });

  it("returns current workspace subscription summary", async () => {
    const { db, service } = createHarness();
    db.subscriptions.push({
      id: "subscription_1",
      workspaceId: "workspace_1",
      status: "active",
      activeInstances: 2,
      asaasSubscriptionId: "sub_asaas_1",
      currentPeriodEnd: new Date("2026-08-02T03:00:00.000Z"),
      plan: {
        name: "Por instancia",
        pricePerWhatsappInstanceCents: 12900
      }
    });

    const subscription = await service.getWorkspaceSubscriptionSummary(
      "workspace_1"
    );

    expect(subscription).toEqual({
      workspaceId: "workspace_1",
      status: "active",
      planName: "Por instancia",
      activeInstances: 2,
      pricePerWhatsappInstanceCents: 12900,
      monthlyAmountCents: 25800,
      currentPeriodEnd: "2026-08-02T03:00:00.000Z",
      asaasSubscriptionId: "sub_asaas_1"
    });
  });

  it("creates checkout records without activating the WhatsApp instance", async () => {
    const { db, service } = createHarness();

    const checkout = await service.createWhatsappInstanceCheckout(
      "workspace_1",
      {
        instanceName: "Comercial",
        provider: "uazapi"
      }
    );

    expect(checkout.status).toBe("pending_payment");
    expect(checkout).toMatchObject({
      paymentProvider: "asaas",
      paymentProviderStatus: "not_configured",
      externalChargeId: null,
      checkoutUrl: null
    });
    expect(db.instances[0]).toMatchObject({
      workspaceId: "workspace_1",
      name: "Comercial",
      provider: "uazapi",
      status: "pending_payment"
    });
    expect(db.charges[0]).toMatchObject({
      workspaceId: "workspace_1",
      provider: "asaas",
      status: "pending",
      amountCents: 12900,
      externalChargeId: null,
      checkoutUrl: null
    });
    expect(db.activations[0]).toMatchObject({
      status: "pending_payment",
      amountCents: 12900
    });
  });

  it("creates an Asaas payment when credentials and customer are ready", async () => {
    const adapter = {
      createPayment: async () => ({
        status: "created" as const,
        externalChargeId: "pay_asaas_1",
        checkoutUrl: "https://sandbox.asaas.com/i/pay_asaas_1"
      })
    };
    const { db, service } = createHarness(adapter);
    db.workspaces[0].asaasCustomerId = "cus_asaas_1";
    db.splitReceivers.push({
      id: "receiver_1",
      walletId: "wallet_1",
      percentageBps: 2500,
      active: true
    });

    const checkout = await service.createWhatsappInstanceCheckout(
      "workspace_1",
      {
        instanceName: "Comercial",
        provider: "uazapi"
      }
    );

    expect(checkout).toMatchObject({
      paymentProviderStatus: "created",
      externalChargeId: "pay_asaas_1",
      checkoutUrl: "https://sandbox.asaas.com/i/pay_asaas_1"
    });
    expect(db.charges[0]).toMatchObject({
      externalChargeId: "pay_asaas_1",
      checkoutUrl: "https://sandbox.asaas.com/i/pay_asaas_1"
    });
  });

  it("activates WhatsApp instance only after Asaas payment confirmation", async () => {
    const { db, service } = createHarness();
    const checkout = await service.createWhatsappInstanceCheckout(
      "workspace_1",
      {
        instanceName: "Comercial",
        provider: "uazapi"
      }
    );
    db.charges[0].externalChargeId = "pay_asaas_1";

    const result = await service.processAsaasPaymentWebhook({
      event: "PAYMENT_RECEIVED",
      payment: {
        id: "pay_asaas_1",
        status: "RECEIVED"
      }
    });

    expect(result).toMatchObject({
      processed: true,
      chargeId: checkout.chargeId,
      status: "paid"
    });
    expect(db.charges[0]).toMatchObject({ status: "paid" });
    expect(db.activations[0]).toMatchObject({ status: "active" });
    expect(db.instances[0]).toMatchObject({ status: "active" });
  });
});
