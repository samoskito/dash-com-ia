import { describe, expect, it } from "vitest";
import { BillingService } from "../src/billing/billing.service";

type FakePrisma = {
  whatsappInstance: {
    count: (args: unknown) => Promise<number>;
    create: (args: unknown) => Promise<Record<string, unknown>>;
  };
  paymentCharge: {
    create: (args: unknown) => Promise<Record<string, unknown>>;
  };
  whatsappInstanceActivation: {
    create: (args: unknown) => Promise<Record<string, unknown>>;
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
    expect(db.instances[0]).toMatchObject({
      workspaceId: "workspace_1",
      name: "Comercial",
      provider: "uazapi",
      status: "pending_payment"
    });
    expect(db.charges[0]).toMatchObject({
      workspaceId: "workspace_1",
      status: "pending",
      amountCents: 12900
    });
    expect(db.activations[0]).toMatchObject({
      status: "pending_payment",
      amountCents: 12900
    });
  });
});
