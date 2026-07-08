import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
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
    findMany: (args: unknown) => Promise<Array<Record<string, unknown>>>;
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
    create: (args: unknown) => Promise<Record<string, unknown>>;
    update: (args: unknown) => Promise<Record<string, unknown>>;
  };
  subscriptionPlan: {
    create: (args: unknown) => Promise<Record<string, unknown>>;
    findFirst: (args: unknown) => Promise<Record<string, unknown> | null>;
    findMany: (args: unknown) => Promise<Array<Record<string, unknown>>>;
    findUnique: (args: unknown) => Promise<Record<string, unknown> | null>;
    update: (args: unknown) => Promise<Record<string, unknown>>;
    updateMany: (args: unknown) => Promise<{ count: number }>;
  };
  integrationLog: {
    create: (args: unknown) => Promise<Record<string, unknown>>;
  };
  auditLog: {
    create: (args: unknown) => Promise<Record<string, unknown>>;
  };
  $transaction: <T>(callback: (tx: FakePrisma) => Promise<T>) => Promise<T>;
};

function createHarness(
  asaasAdapter?: Pick<AsaasAdapter, "createPayment">,
  options: {
    uazapiAdapter?: {
      createInstance: (input: {
        name: string;
        localInstanceId: string;
        workspaceId: string;
      }) => Promise<{
        status: "created" | "not_configured" | "error";
        providerInstanceId: string | null;
        instanceToken: string | null;
        message: string | null;
      }>;
      configureInstanceWebhook?: (input: {
        instanceToken: string | null;
        webhookUrl: string | null;
      }) => Promise<{
        status: "configured" | "not_configured" | "error";
        message: string | null;
      }>;
    };
    tokenEncryption?: {
      encrypt: (token: string) => {
        encryptedAccessToken: string;
        tokenIv: string;
        tokenTag: string;
      };
    };
  } = {}
) {
  const db = {
    instances: [] as Array<Record<string, unknown>>,
    integrationLogs: [] as Array<Record<string, unknown>>,
    auditLogs: [] as Array<Record<string, unknown>>,
    charges: [] as Array<Record<string, unknown>>,
    activations: [] as Array<Record<string, unknown>>,
    splitReceivers: [] as Array<Record<string, unknown>>,
    plans: [] as Array<Record<string, unknown>>,
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
      },
      create: async (args) => {
        const { data } = args as { data: Record<string, unknown> };
        const subscription = {
          id: `subscription_${db.subscriptions.length + 1}`,
          ...data
        };
        db.subscriptions.push(subscription);
        return subscription;
      },
      update: async (args) => {
        const { data, where } = args as {
          data: Record<string, unknown>;
          where: { id: string };
        };
        const index = db.subscriptions.findIndex(
          (subscription) => subscription.id === where.id
        );
        db.subscriptions[index] = {
          ...db.subscriptions[index],
          ...data
        };
        return db.subscriptions[index];
      }
    },
    subscriptionPlan: {
      create: async (args) => {
        const { data } = args as { data: Record<string, unknown> };
        const now = new Date("2026-07-02T03:00:00.000Z");
        const plan = {
          id: `plan_${db.plans.length + 1}`,
          createdAt: now,
          updatedAt: now,
          ...data
        };
        db.plans.push(plan);
        return plan;
      },
      findFirst: async (args) => {
        const { where } = args as { where?: { active?: boolean } };
        const plans = where?.active === undefined
          ? db.plans
          : db.plans.filter((plan) => plan.active === where.active);

        return plans[0] ?? null;
      },
      findMany: async () => db.plans,
      findUnique: async (args) => {
        const { where } = args as { where: { id: string } };
        return db.plans.find((plan) => plan.id === where.id) ?? null;
      },
      update: async (args) => {
        const { data, where } = args as {
          data: Record<string, unknown>;
          where: { id: string };
        };
        const index = db.plans.findIndex((plan) => plan.id === where.id);
        db.plans[index] = {
          ...db.plans[index],
          ...data,
          updatedAt: new Date("2026-07-02T03:30:00.000Z")
        };
        return db.plans[index];
      },
      updateMany: async (args) => {
        const { data, where } = args as {
          data: Record<string, unknown>;
          where: { active?: boolean; id?: { not?: string } };
        };
        let count = 0;

        db.plans = db.plans.map((plan) => {
          const matchesActive =
            where.active === undefined || plan.active === where.active;
          const matchesId =
            where.id?.not === undefined || plan.id !== where.id.not;

          if (!matchesActive || !matchesId) {
            return plan;
          }

          count += 1;

          return {
            ...plan,
            ...data,
            updatedAt: new Date("2026-07-02T03:30:00.000Z")
          };
        });

        return { count };
      }
    },
    integrationLog: {
      create: async (args) => {
        const { data } = args as { data: Record<string, unknown> };
        const log = {
          id: `integration_${db.integrationLogs.length + 1}`,
          startedAt: data.startedAt ?? new Date("2026-07-02T03:00:00.000Z"),
          ...data
        };
        db.integrationLogs.push(log);
        return log;
      }
    },
    auditLog: {
      create: async (args) => {
        const { data } = args as { data: Record<string, unknown> };
        const log = {
          id: `audit_${db.auditLogs.length + 1}`,
          createdAt: data.createdAt ?? new Date("2026-07-02T03:00:00.000Z"),
          ...data
        };
        db.auditLogs.push(log);
        return log;
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
            (() => {
              const activation = db.activations.find(
              (activation) => activation.paymentChargeId === charge.id
              );

              return activation
                ? {
                    ...activation,
                    whatsappInstance:
                      db.instances.find(
                        (instance) =>
                          instance.id === activation.whatsappInstanceId
                      ) ?? null
                  }
                : null;
            })()
        };
      },
      findMany: async (args) => {
        const { where } = (args ?? {}) as {
          where?: { status?: string; workspaceId?: string };
        };

        return db.charges
          .filter(
            (charge) =>
              (!where?.status || charge.status === where.status) &&
              (!where?.workspaceId || charge.workspaceId === where.workspaceId)
          )
          .map((charge) => ({
          ...charge,
          createdAt: charge.createdAt ?? new Date("2026-07-02T11:00:00.000Z"),
          workspace:
            db.workspaces.find(
              (workspace) => workspace.id === charge.workspaceId
            ) ?? null,
          activation:
            db.activations
              .filter((activation) => activation.paymentChargeId === charge.id)
              .map((activation) => ({
                ...activation,
                whatsappInstance:
                  db.instances.find(
                    (instance) =>
                      instance.id === activation.whatsappInstanceId
                  ) ?? null
              }))[0] ?? null
          }));
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
  const uazapiAdapter =
    options.uazapiAdapter ??
    ({
      createInstance: vi.fn(async () => ({
        status: "not_configured" as const,
        providerInstanceId: null,
        instanceToken: null,
        message: "Missing UAZAPI_BASE_URL or UAZAPI_ADMIN_TOKEN"
      })),
      configureInstanceWebhook: vi.fn(
        async (_input: { instanceToken: string | null; webhookUrl: string | null }) => ({
        status: "not_configured" as const,
        message: "Missing UAZAPI_BASE_URL, instance token or webhook URL"
        })
      )
    } as const);
  const tokenEncryption =
    options.tokenEncryption ??
    ({
      encrypt: vi.fn((token: string) => ({
        encryptedAccessToken: `encrypted:${token}`,
        tokenIv: "iv",
        tokenTag: "tag"
      }))
    } as const);

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
      uazapiAdapter as never,
      tokenEncryption as never,
      {
        API_PUBLIC_URL: "https://api.wpptrack.test",
        WPPTRACK_WHATSAPP_INSTANCE_PRICE_CENTS: "12900"
      }
    ),
    tokenEncryption,
    uazapiAdapter
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

  it("uses the active subscription plan price for quotes and checkout charges", async () => {
    const { db, service } = createHarness();
    db.plans.push({
      id: "plan_1",
      name: "Plano Growth",
      slug: "growth",
      pricePerWhatsappInstanceCents: 15900,
      active: true,
      createdAt: new Date("2026-07-02T03:00:00.000Z"),
      updatedAt: new Date("2026-07-02T03:00:00.000Z")
    });

    const quote = await service.getWhatsappInstanceQuote("workspace_1");
    const checkout = await service.createWhatsappInstanceCheckout(
      "workspace_1",
      {
        instanceName: "Comercial",
        provider: "uazapi"
      }
    );

    expect(quote).toMatchObject({
      pricePerInstanceCents: 15900,
      nextInstanceAmountCents: 15900
    });
    expect(checkout.amountCents).toBe(15900);
    expect(db.charges[0]).toMatchObject({
      amountCents: 15900
    });
    expect(db.activations[0]).toMatchObject({
      amountCents: 15900
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

  it("manages subscription plans for platform backoffice", async () => {
    const { db, service } = createHarness();
    db.plans.push({
      id: "plan_1",
      name: "Plano Starter",
      slug: "starter",
      pricePerWhatsappInstanceCents: 9900,
      active: true,
      createdAt: new Date("2026-07-02T02:00:00.000Z"),
      updatedAt: new Date("2026-07-02T02:00:00.000Z")
    });

    const initialPlans = await service.listBackofficeSubscriptionPlans();
    const created = await service.createBackofficeSubscriptionPlan(
      {
        name: "Plano Growth",
        slug: "growth",
        pricePerWhatsappInstanceCents: 12900,
        active: true
      },
      "user_1"
    );
    const updated = await service.updateBackofficeSubscriptionPlan(
      created.id,
      {
        pricePerWhatsappInstanceCents: 14900,
        active: false
      },
      "user_1"
    );

    expect(initialPlans[0]).toMatchObject({
      id: "plan_1",
      name: "Plano Starter",
      slug: "starter",
      pricePerWhatsappInstanceCents: 9900,
      active: true
    });
    expect(updated).toMatchObject({
      id: "plan_2",
      name: "Plano Growth",
      slug: "growth",
      pricePerWhatsappInstanceCents: 14900,
      active: false
    });
    expect(db.auditLogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorUserId: "user_1",
          actorType: "platform_operator",
          action: "billing.plan_created",
          targetType: "SubscriptionPlan",
          targetId: "plan_2"
        }),
        expect.objectContaining({
          actorUserId: "user_1",
          actorType: "platform_operator",
          action: "billing.plan_updated",
          targetType: "SubscriptionPlan",
          targetId: "plan_2"
        })
      ])
    );
  });

  it("keeps only one active subscription plan for billing prices", async () => {
    const { db, service } = createHarness();
    db.plans.push(
      {
        id: "plan_1",
        name: "Plano Starter",
        slug: "starter",
        pricePerWhatsappInstanceCents: 9900,
        active: true,
        createdAt: new Date("2026-07-02T02:00:00.000Z"),
        updatedAt: new Date("2026-07-02T02:00:00.000Z")
      },
      {
        id: "plan_2",
        name: "Plano Growth",
        slug: "growth",
        pricePerWhatsappInstanceCents: 15900,
        active: false,
        createdAt: new Date("2026-07-02T03:00:00.000Z"),
        updatedAt: new Date("2026-07-02T03:00:00.000Z")
      }
    );

    const created = await service.createBackofficeSubscriptionPlan({
      name: "Plano Scale",
      slug: "scale",
      pricePerWhatsappInstanceCents: 24900,
      active: true
    });
    const reactivated = await service.updateBackofficeSubscriptionPlan(
      "plan_2",
      {
        active: true
      }
    );

    expect(created).toMatchObject({
      id: "plan_3",
      active: true
    });
    expect(reactivated).toMatchObject({
      id: "plan_2",
      active: true
    });
    expect(db.plans.filter((plan) => plan.active)).toEqual([
      expect.objectContaining({
        id: "plan_2",
        name: "Plano Growth"
      })
    ]);
  });

  it("lists payment charges for platform backoffice", async () => {
    const { db, service } = createHarness();
    db.workspaces[0].name = "Comunidade NOD";
    const checkout = await service.createWhatsappInstanceCheckout(
      "workspace_1",
      {
        instanceName: "Comercial",
        provider: "uazapi"
      }
    );
    db.charges[0].externalChargeId = "pay_asaas_1";
    db.charges[0].checkoutUrl = "https://sandbox.asaas.com/i/pay_asaas_1";
    db.charges[0].paidAt = new Date("2026-07-02T12:00:00.000Z");

    const charges = await service.listBackofficePaymentCharges();

    expect(charges).toEqual([
      {
        id: checkout.chargeId,
        workspaceId: "workspace_1",
        workspaceName: "Comunidade NOD",
        provider: "asaas",
        externalChargeId: "pay_asaas_1",
        status: "pending",
        amountCents: 12900,
        description: "Ativacao da instancia WhatsApp Comercial",
        checkoutUrl: "https://sandbox.asaas.com/i/pay_asaas_1",
        dueAt: null,
        paidAt: "2026-07-02T12:00:00.000Z",
        createdAt: expect.any(String),
        whatsappInstanceId: "wpp_1",
        whatsappInstanceName: "Comercial"
      }
    ]);
  });

  it("filters payment charges for platform backoffice by status and workspace", async () => {
    const { db, service } = createHarness();
    await service.createWhatsappInstanceCheckout("workspace_1", {
      instanceName: "Comercial",
      provider: "uazapi"
    });
    db.workspaces.push({
      id: "workspace_2",
      name: "Clinica Norte",
      asaasCustomerId: null
    });
    db.charges.push({
      id: "charge_2",
      workspaceId: "workspace_2",
      provider: "asaas",
      status: "failed",
      amountCents: 12900,
      description: "Ativacao da instancia WhatsApp Suporte",
      externalChargeId: "pay_failed",
      checkoutUrl: null
    });

    const charges = await service.listBackofficePaymentCharges({
      status: "failed",
      workspaceId: "workspace_2"
    });

    expect(charges).toHaveLength(1);
    expect(charges[0]).toMatchObject({
      id: "charge_2",
      workspaceId: "workspace_2",
      status: "failed"
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

  it("audits whatsapp instance checkout creation without exposing Asaas charge details", async () => {
    const adapter = {
      createPayment: async () => ({
        status: "created" as const,
        externalChargeId: "pay_asaas_secret_1",
        checkoutUrl: "https://sandbox.asaas.com/i/pay_asaas_secret_1"
      })
    };
    const { db, service } = createHarness(adapter);
    db.workspaces[0].asaasCustomerId = "cus_asaas_1";

    const checkout = await service.createWhatsappInstanceCheckout(
      "workspace_1",
      {
        instanceName: "Comercial",
        provider: "uazapi"
      },
      "user_1"
    );

    expect(db.auditLogs).toContainEqual(
      expect.objectContaining({
        workspaceId: "workspace_1",
        actorUserId: "user_1",
        actorType: "user",
        action: "billing.whatsapp_instance_checkout_created",
        targetType: "PaymentCharge",
        targetId: checkout.chargeId,
        resultStatus: "pending_payment",
        afterSummary: expect.objectContaining({
          whatsappInstanceId: checkout.whatsappInstanceId,
          activationId: checkout.activationId,
          amountCents: 12900,
          paymentProvider: "asaas",
          paymentProviderStatus: "created",
          externalChargeConfigured: true,
          hasCheckoutUrl: true
        })
      })
    );
    expect(JSON.stringify(db.auditLogs)).not.toContain("pay_asaas_secret_1");
    expect(JSON.stringify(db.auditLogs)).not.toContain(
      "https://sandbox.asaas.com/i/pay_asaas_secret_1"
    );
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
    expect(db.integrationLogs).toContainEqual(
      expect.objectContaining({
        workspaceId: "workspace_1",
        source: "asaas",
        operation: "asaas.payment.create",
        status: "success",
        providerRequestId: "pay_asaas_1",
        jobId: "charge_1"
      })
    );
    expect(JSON.stringify(db.integrationLogs)).not.toContain("secret");
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
    expect(db.auditLogs).toContainEqual(
      expect.objectContaining({
        workspaceId: "workspace_1",
        actorUserId: null,
        actorType: "system",
        action: "billing.payment_confirmed",
        targetType: "PaymentCharge",
        targetId: checkout.chargeId,
        resultStatus: "paid"
      })
    );
    expect(db.auditLogs).toContainEqual(
      expect.objectContaining({
        workspaceId: "workspace_1",
        actorUserId: null,
        actorType: "system",
        action: "billing.whatsapp_instance_activated",
        targetType: "WhatsappInstance",
        targetId: checkout.whatsappInstanceId,
        resultStatus: "active"
      })
    );
  });

  it("creates the Uazapi instance after confirmed payment and stores only encrypted token material", async () => {
    const uazapiAdapter = {
      createInstance: vi.fn(async () => ({
        status: "created" as const,
        providerInstanceId: "provider_instance_1",
        instanceToken: "instance-token-1",
        message: null
      })),
      configureInstanceWebhook: vi.fn(
        async (_input: { instanceToken: string | null; webhookUrl: string | null }) => ({
        status: "configured" as const,
        message: null
        })
      )
    };
    const tokenEncryption = {
      encrypt: vi.fn((token: string) => ({
        encryptedAccessToken: `encrypted:${token}`,
        tokenIv: "iv-1",
        tokenTag: "tag-1"
      }))
    };
    const { db, service } = createHarness(undefined, {
      uazapiAdapter,
      tokenEncryption
    });
    const checkout = await service.createWhatsappInstanceCheckout(
      "workspace_1",
      {
        instanceName: "Comercial",
        provider: "uazapi"
      }
    );
    db.charges[0].externalChargeId = "pay_asaas_1";

    await service.processAsaasPaymentWebhook({
      event: "PAYMENT_RECEIVED",
      payment: {
        id: "pay_asaas_1",
        status: "RECEIVED"
      }
    });

    expect(uazapiAdapter.createInstance).toHaveBeenCalledWith({
      name: "Comercial",
      localInstanceId: checkout.whatsappInstanceId,
      workspaceId: "workspace_1"
    });
    expect(uazapiAdapter.configureInstanceWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        instanceToken: "instance-token-1",
        webhookUrl: expect.stringMatching(
          /^https:\/\/api\.wpptrack\.test\/webhooks\/uazapi\/instances\/wpp_1\?token=/
        )
      })
    );
    const configuredWebhook =
      uazapiAdapter.configureInstanceWebhook.mock.calls.at(0)?.[0];
    expect(configuredWebhook).toBeDefined();
    expect(typeof configuredWebhook?.webhookUrl).toBe("string");
    const webhookUrl = configuredWebhook?.webhookUrl as string;
    const webhookToken = new URL(webhookUrl).searchParams.get("token");

    expect(tokenEncryption.encrypt).toHaveBeenCalledWith("instance-token-1");
    expect(db.instances[0]).toMatchObject({
      status: "active",
      providerInstanceId: "provider_instance_1",
      providerTokenEncrypted: "encrypted:instance-token-1",
      providerTokenIv: "iv-1",
      providerTokenTag: "tag-1",
      webhookTokenHash: createHash("sha256")
        .update(webhookToken ?? "")
        .digest("hex")
    });
    expect(db.integrationLogs).toContainEqual(
      expect.objectContaining({
        workspaceId: "workspace_1",
        source: "uazapi",
        operation: "uazapi.instance.create",
        status: "success",
        providerRequestId: "provider_instance_1",
        jobId: checkout.whatsappInstanceId
      })
    );
    expect(JSON.stringify(db)).not.toContain('"instanceToken":"instance-token-1"');
  });

  it("updates the workspace subscription summary after activating a paid instance", async () => {
    const { db, service } = createHarness();
    db.plans.push({
      id: "plan_1",
      name: "Plano Growth",
      slug: "growth",
      pricePerWhatsappInstanceCents: 15900,
      active: true,
      createdAt: new Date("2026-07-02T03:00:00.000Z"),
      updatedAt: new Date("2026-07-02T03:00:00.000Z")
    });
    await service.createWhatsappInstanceCheckout("workspace_1", {
      instanceName: "Comercial",
      provider: "uazapi"
    });
    db.charges[0].externalChargeId = "pay_asaas_1";

    await service.processAsaasPaymentWebhook({
      event: "PAYMENT_CONFIRMED",
      payment: {
        id: "pay_asaas_1",
        status: "CONFIRMED"
      }
    });

    const subscription = await service.getWorkspaceSubscriptionSummary(
      "workspace_1"
    );

    expect(subscription).toMatchObject({
      workspaceId: "workspace_1",
      status: "active",
      planName: "Plano Growth",
      activeInstances: 1,
      pricePerWhatsappInstanceCents: 15900,
      monthlyAmountCents: 15900
    });
    expect(db.subscriptions[0]).toMatchObject({
      planId: "plan_1"
    });
  });

  it("marks the charge as failed without activating the instance when Asaas reports payment failure", async () => {
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
      event: "PAYMENT_OVERDUE",
      payment: {
        id: "pay_asaas_1",
        status: "OVERDUE"
      }
    });

    expect(result).toMatchObject({
      processed: true,
      chargeId: checkout.chargeId,
      status: "failed"
    });
    expect(db.charges[0]).toMatchObject({ status: "failed" });
    expect(db.activations[0]).toMatchObject({ status: "pending_payment" });
    expect(db.instances[0]).toMatchObject({ status: "pending_payment" });
    expect(db.auditLogs).toContainEqual(
      expect.objectContaining({
        workspaceId: "workspace_1",
        actorUserId: null,
        actorType: "system",
        action: "billing.payment_failed",
        targetType: "PaymentCharge",
        targetId: checkout.chargeId,
        resultStatus: "failed"
      })
    );
  });
});
