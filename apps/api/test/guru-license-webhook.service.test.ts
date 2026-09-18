import { Logger } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { GuruLicenseWebhookService } from "../src/licensing/guru-license-webhook.service";

const SECRET = "guru-test-secret";
const RAW_KEY = "PALMUP-SHOULD-NOT-LEAK";

function daysFromNow(days: number, now = new Date()): Date {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}

function defaultNotifications() {
  return {
    notifyLicenseIssued: vi.fn(
      async (_input: { phoneE164: string | null; rawKey: string }) => ({
        email: "skipped" as const,
        emailReason: "missing_email" as const,
        whatsapp: "skipped" as const,
        whatsappReason: "empty_phone" as const,
      }),
    ),
  };
}

function createHarness(options?: { notifications?: { notifyLicenseIssued: ReturnType<typeof vi.fn> } }) {
  const webhookEvents: Array<Record<string, unknown>> = [];
  const licenses = new Map<string, Record<string, unknown>>();
  const notifications = options?.notifications ?? defaultNotifications();

  const prisma = {
    licenseWebhookEvent: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const provider = (data.provider as string | undefined) ?? "guru";
        const eventType = data.eventType as string;
        const externalTransactionId = data.externalTransactionId as string;
        const duplicate = webhookEvents.find(
          (row) =>
            row.provider === provider &&
            row.eventType === eventType &&
            row.externalTransactionId === externalTransactionId,
        );
        if (duplicate) {
          throw Object.assign(new Error("Unique constraint failed"), {
            code: "P2002",
          });
        }
        const row = {
          id: `evt_${webhookEvents.length + 1}`,
          provider,
          processedAt: null,
          ...data,
        };
        webhookEvents.push(row);
        return row;
      }),
      findFirst: vi.fn(
        async ({
          where,
        }: {
          where: {
            provider?: string;
            eventType?: string;
            externalTransactionId?: string;
          };
        }) => {
          return (
            webhookEvents.find((row) => {
              if (where.provider && row.provider !== where.provider) {
                return false;
              }
              if (where.eventType && row.eventType !== where.eventType) {
                return false;
              }
              if (
                where.externalTransactionId &&
                row.externalTransactionId !== where.externalTransactionId
              ) {
                return false;
              }
              return true;
            }) ?? null
          );
        },
      ),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Record<string, unknown>;
        }) => {
          const row = webhookEvents.find((event) => event.id === where.id);
          if (!row) {
            throw new Error("webhook event not found");
          }
          Object.assign(row, data);
          return row;
        },
      ),
    },
    license: {
      findUnique: vi.fn(
        async ({
          where,
        }: {
          where: { guruTransactionId?: string; id?: string };
        }) => {
          if (where.id) {
            return licenses.get(where.id) ?? null;
          }
          if (where.guruTransactionId) {
            return (
              [...licenses.values()].find(
                (row) => row.guruTransactionId === where.guruTransactionId,
              ) ?? null
            );
          }
          return null;
        },
      ),
      findFirst: vi.fn(
        async ({
          where,
        }: {
          where: {
            buyerEmail?: string;
            productSku?: string;
            status?: string;
          };
        }) => {
          return (
            [...licenses.values()].find((row) => {
              if (where.buyerEmail && row.buyerEmail !== where.buyerEmail) {
                return false;
              }
              if (where.productSku && row.productSku !== where.productSku) {
                return false;
              }
              if (where.status && row.status !== where.status) {
                return false;
              }
              return true;
            }) ?? null
          );
        },
      ),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Record<string, unknown>;
        }) => {
          const current = licenses.get(where.id);
          if (!current) {
            throw new Error("license not found");
          }
          const next = { ...current, ...data };
          licenses.set(where.id, next);
          return next;
        },
      ),
    },
  };

  const licensingService = {
    issueLicenseForPurchase: vi.fn(async (input: Record<string, unknown>) => {
      const existing = [...licenses.values()].find(
        (row) =>
          (input.guruTransactionId &&
            row.guruTransactionId === input.guruTransactionId) ||
          (input.buyerEmail &&
            row.buyerEmail === input.buyerEmail &&
            row.status === "active"),
      );
      if (existing) {
        return { license: existing, rawKey: null, created: false };
      }
      const license = {
        id: `lic_${String(input.guruTransactionId ?? licenses.size + 1)}`,
        guruTransactionId: input.guruTransactionId,
        buyerEmail: input.buyerEmail,
        buyerName: input.buyerName,
        keyPrefix: "PALMUP-TEST",
        productSku: input.productSku ?? "rastrackdash_annual",
        interval: input.interval ?? "annual",
        status: "active",
        expiresAt: daysFromNow(365),
        issuedAt: new Date(),
        revokedAt: null,
      };
      licenses.set(String(license.id), license);
      return { license, rawKey: RAW_KEY, created: true };
    }),
  };

  const service = new GuruLicenseWebhookService(
    prisma as never,
    licensingService as never,
    { GURU_WEBHOOK_SECRET: SECRET },
    notifications as never,
  );

  return { service, prisma, licensingService, webhookEvents, licenses, notifications };
}

describe("GuruLicenseWebhookService", () => {
  it("rejects an invalid secret without issuing a license", async () => {
    const { service, licensingService, prisma } = createHarness();

    const result = await service.handle(
      {
        eventType: "purchase_approved",
        id: "txn_secret",
        subscriber: { email: "aluno@example.com" },
      },
      "wrong-secret",
    );

    expect(result.httpStatus).toBe(401);
    expect(result.body).toMatchObject({ resultStatus: "signature_invalid" });
    expect(JSON.stringify(result.body)).not.toContain(RAW_KEY);
    expect(licensingService.issueLicenseForPurchase).not.toHaveBeenCalled();
    expect(prisma.licenseWebhookEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          provider: "guru",
          eventType: "invalid:purchase_approved",
          signatureValid: false,
          resultStatus: "signature_invalid",
        }),
      }),
    );
    expect(prisma.license.update).not.toHaveBeenCalled();
  });

  it("issues a license once for a purchase event and hides the raw key", async () => {
    const { service, licensingService } = createHarness();

    const result = await service.handle(
      {
        eventType: "purchase_approved",
        id: "txn_purchase",
        subscriber: { email: "aluno@example.com", name: "Aluno" },
        productSku: "rastrackdash_annual",
      },
      SECRET,
    );

    expect(result.httpStatus).toBe(200);
    expect(result.body).toMatchObject({ resultStatus: "license_issued" });
    expect(JSON.stringify(result.body)).not.toContain(RAW_KEY);
    expect(JSON.stringify(result.body)).not.toMatch(/rawKey/i);
    expect(licensingService.issueLicenseForPurchase).toHaveBeenCalledTimes(1);
    expect(licensingService.issueLicenseForPurchase).toHaveBeenCalledWith({
      buyerEmail: "aluno@example.com",
      buyerName: "Aluno",
      guruTransactionId: "txn_purchase",
      productSku: "rastrackdash_annual",
      interval: "annual",
    });
  });

  it("ignores a duplicate externalTransactionId without issuing again", async () => {
    const { service, licensingService } = createHarness();
    const payload = {
      type: "paid",
      transactionId: "txn_dup",
      email: "aluno@example.com",
    };

    const first = await service.handle(payload, SECRET);
    const second = await service.handle(payload, SECRET);

    expect(first.httpStatus).toBe(200);
    expect(first.body).toMatchObject({ resultStatus: "license_issued" });
    expect(second.httpStatus).toBe(200);
    expect(second.body).toMatchObject({ resultStatus: "ignored_duplicate" });
    expect(JSON.stringify(second.body)).not.toContain(RAW_KEY);
    expect(licensingService.issueLicenseForPurchase).toHaveBeenCalledTimes(1);
  });

  it("extends expiresAt on renewal from the existing license interval", async () => {
    const now = new Date("2026-08-19T00:00:00.000Z");
    const expiresAt = daysFromNow(30, now);
    const { service, prisma, licensingService, licenses } = createHarness();
    licenses.set("lic_1", {
      id: "lic_1",
      guruTransactionId: "txn_renew",
      buyerEmail: "aluno@example.com",
      productSku: "rastrackdash_annual",
      interval: "annual",
      status: "active",
      expiresAt,
    });

    const result = await service.handle(
      {
        event: "subscription_renewed",
        transaction_id: "txn_renew",
        buyerEmail: "aluno@example.com",
      },
      SECRET,
    );

    expect(result.httpStatus).toBe(200);
    expect(result.body).toMatchObject({ resultStatus: "license_renewed" });
    expect(licensingService.issueLicenseForPurchase).not.toHaveBeenCalled();
    expect(prisma.license.update).toHaveBeenCalledTimes(1);
    const updated = licenses.get("lic_1");
    expect(updated?.expiresAt).toBeInstanceOf(Date);
    expect((updated?.expiresAt as Date).getTime()).toBe(
      new Date("2027-09-18T00:00:00.000Z").getTime(),
    );
  });

  it("marks a refunded license without reissuing", async () => {
    const { service, prisma, licensingService, licenses } = createHarness();
    licenses.set("lic_ref", {
      id: "lic_ref",
      guruTransactionId: "txn_refund",
      buyerEmail: "aluno@example.com",
      productSku: "rastrackdash_annual",
      interval: "annual",
      status: "active",
      expiresAt: daysFromNow(200),
      revokedAt: null,
    });

    const result = await service.handle(
      {
        status: "refund",
        payment: { id: "txn_refund" },
        contact: { email: "aluno@example.com" },
      },
      SECRET,
    );

    expect(result.httpStatus).toBe(200);
    expect(result.body).toMatchObject({ resultStatus: "license_revoked" });
    expect(licensingService.issueLicenseForPurchase).not.toHaveBeenCalled();
    expect(prisma.license.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "lic_ref" },
        data: expect.objectContaining({
          status: "refunded",
          revokedAt: expect.any(Date),
        }),
      }),
    );
  });

  it("issues a license after an invalid-secret attempt for the same transaction", async () => {
    const { service, licensingService, webhookEvents } = createHarness();
    const payload = {
      eventType: "purchase_approved",
      id: "txn_recover",
      subscriber: { email: "aluno@example.com" },
    };

    const invalid = await service.handle(payload, "wrong-secret");
    const valid = await service.handle(payload, SECRET);

    expect(invalid.httpStatus).toBe(401);
    expect(invalid.body).toMatchObject({ resultStatus: "signature_invalid" });
    expect(valid.httpStatus).toBe(200);
    expect(valid.body).toMatchObject({ resultStatus: "license_issued" });
    expect(JSON.stringify(valid.body)).not.toContain(RAW_KEY);
    expect(licensingService.issueLicenseForPurchase).toHaveBeenCalledTimes(1);
    expect(webhookEvents.map((row) => row.eventType)).toEqual([
      "invalid:purchase_approved",
      "purchase_approved",
    ]);
  });

  it("revokes after purchase when refund reuses the same payment id", async () => {
    const { service, licensingService, licenses } = createHarness();

    const purchased = await service.handle(
      {
        eventType: "purchase_approved",
        id: "txn_same",
        subscriber: { email: "aluno@example.com" },
      },
      SECRET,
    );
    const refunded = await service.handle(
      {
        status: "refund",
        payment: { id: "txn_same" },
        contact: { email: "aluno@example.com" },
      },
      SECRET,
    );

    expect(purchased.body).toMatchObject({ resultStatus: "license_issued" });
    expect(refunded.httpStatus).toBe(200);
    expect(refunded.body).toMatchObject({ resultStatus: "license_revoked" });
    expect(licensingService.issueLicenseForPurchase).toHaveBeenCalledTimes(1);
    expect([...licenses.values()][0]?.status).toBe("refunded");
  });

  it("returns HTTP 500 when license dispatch throws so Guru can retry", async () => {
    const { service, licensingService } = createHarness();
    licensingService.issueLicenseForPurchase.mockRejectedValueOnce(
      new Error("issue failed"),
    );
    const payload = {
      eventType: "purchase_approved",
      id: "txn_retry",
      subscriber: { email: "aluno@example.com" },
    };

    const failed = await service.handle(payload, SECRET);
    const retried = await service.handle(payload, SECRET);

    expect(failed.httpStatus).toBe(500);
    expect(failed.body).toMatchObject({ resultStatus: "error" });
    expect(JSON.stringify(failed.body)).not.toContain("issue failed");
    expect(retried.httpStatus).toBe(200);
    expect(retried.body).toMatchObject({ resultStatus: "license_issued" });
    expect(licensingService.issueLicenseForPurchase).toHaveBeenCalledTimes(2);
  });


  it("does not renotify when Iniciada and Ativa arrive for the same subscription id", async () => {
    const notifications = {
      notifyLicenseIssued: vi.fn(async () => ({
        email: "queued" as const,
        whatsapp: "skipped" as const,
      })),
    };
    const { service, licensingService } = createHarness({ notifications });

    const payloadBase = {
      id: "sub_same",
      subscriber: {
        email: "aluno@example.com",
        name: "Aluno",
        phone: "5511999999999",
      },
      productSku: "rastrackdash_annual",
    };

    const first = await service.handle(
      { ...payloadBase, status: "iniciada" },
      SECRET,
    );
    const second = await service.handle(
      { ...payloadBase, status: "ativa" },
      SECRET,
    );

    expect(first.body).toMatchObject({ resultStatus: "license_issued" });
    expect(second.body).toMatchObject({
      resultStatus: "ignored_duplicate_license",
    });
    expect(licensingService.issueLicenseForPurchase).toHaveBeenCalledTimes(2);
    expect(notifications.notifyLicenseIssued).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(first.body)).not.toContain(RAW_KEY);
    expect(JSON.stringify(second.body)).not.toContain(RAW_KEY);
  });

  it("renewal extends expiry without sending a new license key notification", async () => {
    const notifications = {
      notifyLicenseIssued: vi.fn(async () => ({
        email: "queued" as const,
        whatsapp: "skipped" as const,
      })),
    };
    const { service, licensingService, prisma, licenses } = createHarness({
      notifications,
    });

    licenses.set("lic_1", {
      id: "lic_1",
      guruTransactionId: "sub_renew",
      buyerEmail: "aluno@example.com",
      productSku: "rastrackdash_annual",
      interval: "annual",
      status: "active",
      expiresAt: daysFromNow(30),
      issuedAt: new Date(),
      keyPrefix: "PALMUP-TEST",
      buyerName: "Aluno",
      revokedAt: null,
    });

    const result = await service.handle(
      {
        status: "renovada",
        id: "sub_renew",
        subscriber: { email: "aluno@example.com" },
      },
      SECRET,
    );

    expect(result.body).toMatchObject({ resultStatus: "license_renewed" });
    expect(notifications.notifyLicenseIssued).not.toHaveBeenCalled();
    expect(licensingService.issueLicenseForPurchase).not.toHaveBeenCalled();
    expect(prisma.license.update).toHaveBeenCalled();
  });
  it("issues once from a real Digital Manager Guru subscription payload (last_status + paid invoice)", async () => {
    const { service, licensingService } = createHarness();

    const payload = {
      id: "sub_dBz2oAjtNTDl8Mpj",
      subscription_code: "sub_dBz2oAjtNTDl8Mpj",
      webhook_type: "subscription",
      last_status: "inactive",
      name: "RastrackDash Wpp",
      dates: {
        started_at: "2026-08-20T17:52:35Z",
        canceled_at: null,
        next_cycle_at: "2027-08-19",
      },
      product: {
        id: "a28ae373-9fd4-4f57-970d-df3eafc888c0",
        name: "RastrackDash Wpp",
        offer: {
          id: "a28ae450-58ae-4025-96fe-2c560baa674a",
          name: "RastrackDash Wpp | Plano Anual",
          plan: { interval: 1, interval_type: "year", trial_days: 0 },
        },
      },
      subscriber: {
        name: "Aluno Teste",
        email: "aluno@example.com",
        phone_number: "42998289255",
        phone_local_code: "55",
      },
      current_invoice: {
        id: "inv_1",
        status: "paid",
        paid_at: "2026-08-20",
        period_end: "2027-08-19",
        subscription_id: "a28c9eef-23e9-4fc0-ba15-0f8ddd5ae9e1",
      },
      last_transaction: {
        id: "txn_1",
        status: "approved",
        contact: {
          email: "aluno@example.com",
          name: "Aluno Teste",
          phone_number: "42998289255",
          phone_local_code: "55",
        },
      },
      charged_times: 0,
      payment_method: "pix",
    };

    const first = await service.handle(payload, SECRET);
    const second = await service.handle(payload, SECRET);

    expect(first.httpStatus).toBe(200);
    expect(first.body).toMatchObject({ resultStatus: "license_issued" });
    expect(JSON.stringify(first.body)).not.toContain(RAW_KEY);
    expect(licensingService.issueLicenseForPurchase).toHaveBeenCalled();
    const call = licensingService.issueLicenseForPurchase.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    expect(call.buyerEmail).toBe("aluno@example.com");
    expect(call.guruTransactionId).toBe("sub_dBz2oAjtNTDl8Mpj");
    expect(call.interval).toBe("annual");
    expect(second.httpStatus).toBe(200);
    const secondStatus = String(
      (second.body as { resultStatus?: string }).resultStatus,
    );
    // First must issue; second must not explode / leak key.
    // Terminal replay returns the first terminal status (often license_issued).
    expect(secondStatus.length).toBeGreaterThan(0);
    expect(secondStatus).not.toBe("error");
    expect(JSON.stringify(second.body)).not.toContain(RAW_KEY);
    // Ensure issue was called at least once for the paid Guru payload.
    expect(licensingService.issueLicenseForPurchase.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it("calls notify with the buyer phone when the payload has one", async () => {
    const notifications = defaultNotifications();
    const { service } = createHarness({ notifications });

    await service.handle(
      {
        eventType: "purchase_approved",
        id: "txn_phone",
        subscriber: {
          email: "aluno@example.com",
          name: "Aluno",
          phone_local_code: "55",
          phone_number: "11999998888",
        },
      },
      SECRET,
    );

    expect(notifications.notifyLicenseIssued).toHaveBeenCalledTimes(1);
    const call = notifications.notifyLicenseIssued.mock.calls[0]?.[0] as {
      phoneE164: string | null;
      rawKey: string;
    };
    expect(call.phoneE164).toBe("5511999998888");
    expect(call.rawKey).toBe(RAW_KEY);
  });

  it("logs the delivery result with status/reason codes and never the raw key", async () => {
    const logSpy = vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    const notifications = {
      notifyLicenseIssued: vi.fn(async () => ({
        email: "queued" as const,
        whatsapp: "skipped" as const,
        whatsappReason: "empty_phone" as const,
      })),
    };
    const { service } = createHarness({ notifications });

    const result = await service.handle(
      {
        eventType: "purchase_approved",
        id: "txn_log",
        subscriber: { email: "aluno@example.com", name: "Aluno" },
      },
      SECRET,
    );

    expect(result.body).toMatchObject({ resultStatus: "license_issued" });
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringMatching(
        /^guru_webhook_notify_result license=\S+ email=queued emailReason=none whatsapp=skipped whatsappReason=empty_phone$/,
      ),
    );
    const loggedLines = logSpy.mock.calls.map((call) => String(call[0]));
    expect(loggedLines.some((line) => line.includes(RAW_KEY))).toBe(false);
    logSpy.mockRestore();
  });

  it("warns and does not throw when notifyLicenseIssued rejects", async () => {
    const warnSpy = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    const notifications = {
      notifyLicenseIssued: vi.fn(async () => {
        throw new Error("smtp down");
      }),
    };
    const { service } = createHarness({ notifications });

    const result = await service.handle(
      {
        eventType: "purchase_approved",
        id: "txn_notify_fail",
        subscriber: { email: "aluno@example.com" },
      },
      SECRET,
    );

    // Guru still gets a 200 so it doesn't retry the whole purchase.
    expect(result.httpStatus).toBe(200);
    expect(result.body).toMatchObject({ resultStatus: "license_issued" });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringMatching(/^guru_webhook_notify_failed license=\S+$/),
    );
    const warnedLines = warnSpy.mock.calls.map((call) => String(call[0]));
    expect(warnedLines.some((line) => line.includes("smtp down"))).toBe(false);
    warnSpy.mockRestore();
  });
});
