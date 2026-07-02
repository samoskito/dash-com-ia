import { describe, expect, it } from "vitest";
import { BillingService } from "../src/billing/billing.service";

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
  $transaction: <T>(callback: (tx: FakePrisma) => Promise<T>) => Promise<T>;
};

function createHarness() {
  const db = {
    instances: [] as Array<Record<string, unknown>>,
    charges: [] as Array<Record<string, unknown>>,
    activations: [] as Array<Record<string, unknown>>
  };
  const prisma: FakePrisma = {
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
    service: new BillingService(prisma as never, {
      WPPTRACK_WHATSAPP_INSTANCE_PRICE_CENTS: "12900"
    })
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
