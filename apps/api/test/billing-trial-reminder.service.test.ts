import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { BillingTrialReminderService } from "../src/billing/billing-trial-reminder.service";

describe("BillingTrialReminderService", () => {
  it("sends email and whatsapp once and is idempotent on unique delivery", async () => {
    const deliveryCreate = vi
      .fn()
      .mockResolvedValueOnce({ id: "delivery_1" })
      .mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError("dup", {
          code: "P2002",
          clientVersion: "test",
        }),
      );
    const prisma = {
      workspaceSubscription: {
        findUnique: vi.fn().mockResolvedValue({
          workspaceId: "workspace_1",
          trialEndsAt: new Date("2026-09-20T12:00:00.000Z"),
          workspace: {
            name: "Cliente Demo",
            members: [
              { user: { email: "owner@example.com", name: "Owner" } },
            ],
            opsAlertSettings: { alertPhonesE164: ["5511999999999"] },
          },
          whatsappSeats: [{ id: "seat_1" }, { id: "seat_2" }],
        }),
      },
      billingTrialReminderDelivery: {
        create: deliveryCreate,
        update: vi.fn().mockResolvedValue({}),
      },
      billingContractAudit: { create: vi.fn().mockResolvedValue({}) },
    };
    const templates = {
      list: vi.fn().mockResolvedValue([
        {
          moment: "d3",
          emailSubject: "Fim em {{data_fim}}",
          body: "Ola {{cliente}} — {{numeros}} por {{valor}} {{link_assinatura}}",
        },
      ]),
    };
    const emailQueue = {
      isEnabled: () => true,
      enqueue: vi.fn().mockResolvedValue({ deliveryId: "email_1" }),
    };
    const notifier = {
      sendText: vi.fn().mockResolvedValue(true),
    };
    const configuration = {
      checkoutSuccessUrl: () => "https://app.example.com/subscription",
    };

    const service = new BillingTrialReminderService(
      prisma as never,
      templates as never,
      configuration as never,
      emailQueue as never,
      notifier as never,
    );

    await expect(service.sendOnce("trial_1", "d3")).resolves.toBe(true);
    expect(emailQueue.enqueue).toHaveBeenCalledOnce();
    expect(notifier.sendText).toHaveBeenCalledWith(
      "5511999999999",
      expect.stringContaining("Cliente Demo"),
    );

    await expect(service.sendOnce("trial_1", "d3")).resolves.toBe(false);
    expect(emailQueue.enqueue).toHaveBeenCalledOnce();
  });
});
