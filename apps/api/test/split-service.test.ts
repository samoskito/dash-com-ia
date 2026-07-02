import { describe, expect, it } from "vitest";
import { SplitService } from "../src/billing/split.service";

type Receiver = {
  id: string;
  name: string;
  walletId: string;
  email: string | null;
  percentageBps: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

function createHarness() {
  const now = new Date("2026-07-02T03:00:00.000Z");
  const db = {
    receivers: [] as Receiver[],
    auditLogs: [] as Array<Record<string, unknown>>
  };
  const prisma = {
    splitReceiver: {
      findMany: async () => db.receivers,
      findUnique: async ({ where }: { where: { id: string } }) =>
        db.receivers.find((receiver) => receiver.id === where.id) ?? null,
      create: async ({ data }: { data: Omit<Receiver, "id" | "createdAt" | "updatedAt"> }) => {
        const receiver = {
          id: `receiver_${db.receivers.length + 1}`,
          ...data,
          createdAt: now,
          updatedAt: now
        };
        db.receivers.push(receiver);
        return receiver;
      },
      update: async ({ data, where }: { data: Partial<Receiver>; where: { id: string } }) => {
        const index = db.receivers.findIndex((receiver) => receiver.id === where.id);
        db.receivers[index] = {
          ...db.receivers[index],
          ...data,
          updatedAt: now
        };
        return db.receivers[index];
      }
    },
    auditLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const log = {
          id: `audit_${db.auditLogs.length + 1}`,
          ...data,
          createdAt: now
        };
        db.auditLogs.push(log);
        return log;
      }
    }
  };

  return {
    db,
    service: new SplitService(prisma as never)
  };
}

describe("split service", () => {
  it("creates and lists split receivers for platform backoffice", async () => {
    const { service } = createHarness();

    await service.createReceiver({
      name: "Socio Operacional",
      walletId: "wallet_asaas_1",
      email: "socio@wpptrack.com",
      percentageBps: 2500,
      active: true
    });
    const receivers = await service.listReceivers();

    expect(receivers).toHaveLength(1);
    expect(receivers[0]).toMatchObject({
      name: "Socio Operacional",
      percentageBps: 2500,
      active: true
    });
  });

  it("audits split receiver creation without exposing wallet id", async () => {
    const { db, service } = createHarness();

    const receiver = await service.createReceiver(
      {
        name: "Socio Operacional",
        walletId: "wallet_asaas_secret_1",
        email: "socio@wpptrack.com",
        percentageBps: 2500,
        active: true
      },
      "user_1"
    );

    expect(db.auditLogs).toContainEqual(
      expect.objectContaining({
        actorUserId: "user_1",
        actorType: "platform_operator",
        action: "split_receiver.created",
        targetType: "SplitReceiver",
        targetId: receiver.id,
        resultStatus: "active",
        beforeSummary: undefined,
        afterSummary: expect.objectContaining({
          name: "Socio Operacional",
          emailHash: expect.any(String),
          walletIdHash: expect.any(String),
          percentageBps: 2500,
          active: true
        })
      })
    );
    expect(JSON.stringify(db.auditLogs)).not.toContain("wallet_asaas_secret_1");
    expect(JSON.stringify(db.auditLogs)).not.toContain("socio@wpptrack.com");
  });

  it("updates receiver percentage and active state", async () => {
    const { service } = createHarness();
    const receiver = await service.createReceiver({
      name: "Socio Operacional",
      walletId: "wallet_asaas_1",
      email: null,
      percentageBps: 2500,
      active: true
    });

    const updated = await service.updateReceiver(receiver.id, {
      percentageBps: 1500,
      active: false
    });

    expect(updated.percentageBps).toBe(1500);
    expect(updated.active).toBe(false);
  });

  it("audits split receiver updates with before and after summaries", async () => {
    const { db, service } = createHarness();
    const receiver = await service.createReceiver({
      name: "Socio Operacional",
      walletId: "wallet_asaas_secret_1",
      email: "socio@wpptrack.com",
      percentageBps: 2500,
      active: true
    });
    db.auditLogs.length = 0;

    await service.updateReceiver(
      receiver.id,
      {
        percentageBps: 1500,
        active: false
      },
      "user_1"
    );

    expect(db.auditLogs).toContainEqual(
      expect.objectContaining({
        actorUserId: "user_1",
        actorType: "platform_operator",
        action: "split_receiver.updated",
        targetType: "SplitReceiver",
        targetId: receiver.id,
        resultStatus: "paused",
        beforeSummary: expect.objectContaining({
          name: "Socio Operacional",
          walletIdHash: expect.any(String),
          percentageBps: 2500,
          active: true
        }),
        afterSummary: expect.objectContaining({
          name: "Socio Operacional",
          walletIdHash: expect.any(String),
          percentageBps: 1500,
          active: false
        })
      })
    );
    expect(JSON.stringify(db.auditLogs)).not.toContain("wallet_asaas_secret_1");
    expect(JSON.stringify(db.auditLogs)).not.toContain("socio@wpptrack.com");
  });
});
