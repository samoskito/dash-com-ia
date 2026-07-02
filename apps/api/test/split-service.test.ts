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
    receivers: [] as Receiver[]
  };
  const prisma = {
    splitReceiver: {
      findMany: async () => db.receivers,
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
});
