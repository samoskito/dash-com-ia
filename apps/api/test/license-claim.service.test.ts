import { HttpException, Logger } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { LicenseClaimService } from "../src/licensing/license-claim.service";

const EMAIL = "ana@x.com";
const RAW_EMAIL = " Ana@X.com ";
const BUYER_NAME = "Ana";
const CODE = "123456";
const WRONG_CODE = "654321";
const RAW_KEY = "PALMUP-TEST-KEY1-KEY2-KEY3";
const PRODUCT = "Comunidade A Nova Ordem do Digital";
const NOW = new Date("2026-09-23T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1_000;

type ClaimRow = {
  id: string;
  emailNormalized: string;
  status: string;
  codeHash: string | null;
  codeExpiresAt: Date | null;
  codeAttempts: number;
  codeSentCount: number;
  codeWindowStartedAt: Date | null;
  lastCodeSentAt: Date | null;
  sourceProduct: string | null;
  buyerName: string | null;
  phoneE164: string | null;
  licenseId: string | null;
  issuedAt: Date | null;
  revealedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type LicenseRow = {
  id: string;
  keyPrefix: string;
  buyerEmail: string | null;
  buyerName: string | null;
  productSku: string;
  interval: "monthly" | "semiannual" | "annual";
  status: string;
  expiresAt: Date;
  issuedAt: Date;
  boundAccountEmail: string | null;
  boundAt: Date | null;
};

type ArtifactRow = {
  licenseId: string;
  ciphertext: string;
  iv: string;
  authTag: string;
  expiresAt: Date;
};

type WhereValue = string | number | Date | { gt?: Date; lt?: number };

function codeHash(claimId: string, code = CODE): string {
  return `claim-code:${claimId}:${code}`;
}

function makeClaim(overrides: Partial<ClaimRow> = {}): ClaimRow {
  const id = overrides.id ?? "claim-1";
  return {
    id,
    emailNormalized: EMAIL,
    status: "code_sent",
    codeHash: codeHash(id),
    codeExpiresAt: new Date(NOW.getTime() + 15 * 60_000),
    codeAttempts: 0,
    codeSentCount: 1,
    codeWindowStartedAt: new Date(NOW.getTime() - 60_000),
    lastCodeSentAt: NOW,
    sourceProduct: PRODUCT,
    buyerName: BUYER_NAME,
    phoneE164: "5511999998888",
    licenseId: null,
    issuedAt: null,
    revealedAt: null,
    createdAt: new Date(NOW.getTime() - 60_000),
    updatedAt: new Date(NOW.getTime() - 60_000),
    ...overrides,
  };
}

function makeLicense(overrides: Partial<LicenseRow> = {}): LicenseRow {
  return {
    id: "license-1",
    keyPrefix: "PALMUP-TEST",
    buyerEmail: EMAIL,
    buyerName: BUYER_NAME,
    productSku: "rastrackdash_student_claim",
    interval: "annual",
    status: "active",
    expiresAt: new Date(NOW.getTime() + 365 * DAY_MS),
    issuedAt: NOW,
    boundAccountEmail: EMAIL,
    boundAt: NOW,
    ...overrides,
  };
}

function makeArtifact(
  licenseId: string,
  overrides: Partial<ArtifactRow> = {},
): ArtifactRow {
  return {
    licenseId,
    ciphertext: `encrypted:${RAW_KEY}`,
    iv: "test-iv",
    authTag: "test-auth-tag",
    expiresAt: new Date(NOW.getTime() + 7 * DAY_MS),
    ...overrides,
  };
}

function copy<T extends Record<string, unknown>>(row: T): T {
  return { ...row };
}

function matchesWhere(
  row: Record<string, unknown>,
  where: Record<string, WhereValue>,
): boolean {
  return Object.entries(where).every(([field, expected]) => {
    const actual = row[field];
    if (
      expected &&
      typeof expected === "object" &&
      !(expected instanceof Date)
    ) {
      if (expected.gt instanceof Date) {
        return (
          actual instanceof Date && actual.getTime() > expected.gt.getTime()
        );
      }
      if (typeof expected.lt === "number") {
        return typeof actual === "number" && actual < expected.lt;
      }
    }
    return actual === expected;
  });
}

function applyData(
  row: Record<string, unknown>,
  data: Record<string, unknown>,
): void {
  for (const [field, value] of Object.entries(data)) {
    if (
      value &&
      typeof value === "object" &&
      "increment" in value &&
      typeof (value as { increment?: unknown }).increment === "number"
    ) {
      row[field] =
        Number(row[field] ?? 0) + (value as { increment: number }).increment;
    } else {
      row[field] = value;
    }
  }
  row.updatedAt = new Date();
}

function httpErrorBody(error: unknown): {
  status: number;
  body: Record<string, unknown>;
} {
  expect(error).toBeInstanceOf(HttpException);
  const exception = error as HttpException;
  const response = exception.getResponse();
  return {
    status: exception.getStatus(),
    body:
      typeof response === "string"
        ? { message: response }
        : (response as Record<string, unknown>),
  };
}

function expectInvalidCode(error: unknown): Record<string, unknown> {
  const { status, body } = httpErrorBody(error);
  expect(status).toBe(400);
  expect(body).toEqual({
    statusCode: 400,
    code: "license_claim_code_invalid",
    message: "Código inválido ou expirado.",
  });
  return body;
}

function createHarness(options?: {
  env?: Record<string, string>;
  lookup?: Record<string, unknown>;
}) {
  const claims = new Map<string, ClaimRow>();
  const licenses = new Map<string, LicenseRow>();
  const artifacts = new Map<string, ArtifactRow>();
  let nextClaimId = 1;

  const findClaim = (where: { id?: string; emailNormalized?: string }) => {
    if (where.emailNormalized) {
      return claims.get(where.emailNormalized) ?? null;
    }
    if (where.id) {
      return (
        [...claims.values()].find((candidate) => candidate.id === where.id) ??
        null
      );
    }
    return null;
  };

  const prisma = {
    licenseClaim: {
      upsert: vi.fn(
        async ({
          where,
          create,
          update,
        }: {
          where: { emailNormalized: string };
          create: Record<string, unknown>;
          update: Record<string, unknown>;
        }) => {
          const current = claims.get(where.emailNormalized);
          if (current) {
            applyData(current as unknown as Record<string, unknown>, update);
            return copy(current);
          }
          const id = `claim-${nextClaimId++}`;
          const created = makeClaim({
            id,
            emailNormalized: String(create.emailNormalized),
            status: String(create.status),
            codeHash: null,
            codeExpiresAt: null,
            codeAttempts: 0,
            codeSentCount: 0,
            codeWindowStartedAt: null,
            lastCodeSentAt: null,
            sourceProduct: (create.sourceProduct as string | null) ?? null,
            buyerName: (create.buyerName as string | null) ?? null,
            phoneE164: (create.phoneE164 as string | null) ?? null,
            createdAt: NOW,
            updatedAt: NOW,
          });
          claims.set(created.emailNormalized, created);
          return copy(created);
        },
      ),
      findUnique: vi.fn(
        async ({
          where,
        }: {
          where: { id?: string; emailNormalized?: string };
        }) => {
          const found = findClaim(where);
          return found ? copy(found) : null;
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
          const current = findClaim(where);
          if (!current) {
            throw new Error("claim not found");
          }
          applyData(current as unknown as Record<string, unknown>, data);
          return copy(current);
        },
      ),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: Record<string, WhereValue>;
          data: Record<string, unknown>;
        }) => {
          const current = [...claims.values()].find((candidate) =>
            matchesWhere(
              candidate as unknown as Record<string, unknown>,
              where,
            ),
          );
          if (!current) {
            return { count: 0 };
          }
          applyData(current as unknown as Record<string, unknown>, data);
          return { count: 1 };
        },
      ),
    },
    license: {
      findFirst: vi.fn(
        async ({
          where,
        }: {
          where: {
            buyerEmail?: string;
            productSku?: string;
            status?: string;
            expiresAt?: { gt: Date };
          };
        }) => {
          const found = [...licenses.values()]
            .filter((license) => {
              if (where.buyerEmail && license.buyerEmail !== where.buyerEmail) {
                return false;
              }
              if (where.productSku && license.productSku !== where.productSku) {
                return false;
              }
              if (where.status && license.status !== where.status) {
                return false;
              }
              if (
                where.expiresAt?.gt &&
                license.expiresAt.getTime() <= where.expiresAt.gt.getTime()
              ) {
                return false;
              }
              return true;
            })
            .sort(
              (left, right) =>
                right.issuedAt.getTime() - left.issuedAt.getTime(),
            )[0];
          return found ? copy(found) : null;
        },
      ),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const found = licenses.get(where.id);
        return found ? copy(found) : null;
      }),
    },
    licenseDeliveryArtifact: {
      findUnique: vi.fn(async ({ where }: { where: { licenseId: string } }) => {
        const found = artifacts.get(where.licenseId);
        return found ? copy(found) : null;
      }),
    },
  };

  const studentBase = {
    findEligiblePurchase: vi.fn(
      async () =>
        options?.lookup ?? {
          kind: "eligible",
          buyerName: BUYER_NAME,
          phone: "(11) 99999-8888",
          productName: PRODUCT,
        },
    ),
  };
  const codes = {
    generate: vi.fn(() => CODE),
    hash: vi.fn((claimId: string, code: string) => codeHash(claimId, code)),
    verify: vi.fn(
      (claimId: string, code: string, storedHash: string | null) =>
        storedHash === codeHash(claimId, code),
    ),
  };
  const licensing = {
    issueLicenseForPurchase: vi.fn(
      async (input: {
        buyerEmail: string;
        buyerName: string | null;
        productSku: string;
        interval: "monthly" | "semiannual" | "annual";
        now: Date;
      }) => {
        const license = makeLicense({
          id: `license-${licenses.size + 1}`,
          buyerEmail: input.buyerEmail,
          buyerName: input.buyerName,
          productSku: input.productSku,
          interval: input.interval,
          issuedAt: input.now,
          expiresAt: new Date(input.now.getTime() + 365 * DAY_MS),
          boundAccountEmail: null,
          boundAt: null,
        });
        licenses.set(license.id, license);
        return { license: copy(license), rawKey: RAW_KEY, created: true };
      },
    ),
  };
  const binding = {
    bindIfNeeded: vi.fn(async (licenseId: string, accountIdentity: string) => {
      const license = licenses.get(licenseId);
      if (!license) {
        throw new Error("license not found");
      }
      license.boundAccountEmail = accountIdentity;
      license.boundAt = NOW;
      return copy(license);
    }),
  };
  const notifications = {
    notifyLicenseIssued: vi.fn(
      async (input: { license: LicenseRow; rawKey: string }) => {
        artifacts.set(input.license.id, makeArtifact(input.license.id));
        return {
          email: "queued" as const,
          emailReason: "queued" as const,
          whatsapp: "skipped" as const,
          whatsappReason: "empty_phone" as const,
        };
      },
    ),
  };
  const deliverySecrets = {
    decrypt: vi.fn(
      (
        _licenseId: string,
        encrypted: { ciphertext: string; iv: string; authTag: string },
      ) => {
        if (encrypted.ciphertext !== `encrypted:${RAW_KEY}`) {
          throw new Error("decrypt failed");
        }
        return RAW_KEY;
      },
    ),
  };
  const emailQueue = {
    enqueue: vi.fn(async () => ({ id: "email-job-1" })),
  };
  const env = {
    LICENSE_DELIVERY_SECRET: "test-delivery-secret",
    ...options?.env,
  };

  const service = new LicenseClaimService(
    prisma as never,
    studentBase as never,
    codes as never,
    licensing as never,
    binding as never,
    notifications as never,
    deliverySecrets as never,
    emailQueue as never,
    env,
  );

  const seedClaim = (overrides: Partial<ClaimRow> = {}) => {
    const row = makeClaim(overrides);
    claims.set(row.emailNormalized, row);
    return row;
  };
  const seedLicense = (overrides: Partial<LicenseRow> = {}) => {
    const row = makeLicense(overrides);
    licenses.set(row.id, row);
    return row;
  };
  const seedArtifact = (
    licenseId: string,
    overrides: Partial<ArtifactRow> = {},
  ) => {
    const row = makeArtifact(licenseId, overrides);
    artifacts.set(licenseId, row);
    return row;
  };

  return {
    service,
    prisma,
    studentBase,
    codes,
    licensing,
    binding,
    notifications,
    deliverySecrets,
    emailQueue,
    claims,
    licenses,
    artifacts,
    seedClaim,
    seedLicense,
    seedArtifact,
  };
}

describe("LicenseClaimService plan matrix C1-C16", () => {
  it("C1 creates a normalized claim and sends one code without minting", async () => {
    const harness = createHarness();

    await expect(harness.service.processRequest(RAW_EMAIL, NOW)).resolves.toBe(
      "eligible",
    );

    const claim = harness.claims.get(EMAIL);
    expect(claim).toMatchObject({
      emailNormalized: EMAIL,
      status: "code_sent",
      sourceProduct: PRODUCT,
      buyerName: BUYER_NAME,
      codeSentCount: 1,
      codeAttempts: 0,
    });
    expect(claim?.codeHash).toBe(codeHash(claim?.id ?? "", CODE));
    expect(harness.emailQueue.enqueue).toHaveBeenCalledTimes(1);
    expect(harness.emailQueue.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        envelope: expect.objectContaining({
          to: { address: EMAIL },
          template: "license_claim_code",
          data: expect.objectContaining({
            code: CODE,
            productName: "RastrackDash",
          }),
        }),
      }),
    );
    expect(harness.licenses).toHaveLength(0);
    expect(harness.licensing.issueLicenseForPurchase).not.toHaveBeenCalled();
  });

  it("C2 leaves no state or email for an ineligible purchase", async () => {
    const harness = createHarness({ lookup: { kind: "not_eligible" } });

    await expect(harness.service.processRequest(EMAIL, NOW)).resolves.toBe(
      "not_eligible",
    );

    expect(harness.claims).toHaveLength(0);
    expect(harness.emailQueue.enqueue).not.toHaveBeenCalled();
  });

  it("C3 converts a MySQL timeout into a non-throwing reason code", async () => {
    const harness = createHarness({
      lookup: { kind: "unavailable", reason: "timeout" },
    });

    await expect(harness.service.processRequest(EMAIL, NOW)).resolves.toBe(
      "mysql_unavailable:timeout",
    );

    expect(harness.claims).toHaveLength(0);
    expect(harness.emailQueue.enqueue).not.toHaveBeenCalled();
  });

  it("C4 enforces the one-minute resend cooldown", async () => {
    const harness = createHarness();
    harness.seedClaim({
      lastCodeSentAt: new Date(NOW.getTime() - 30_000),
      codeSentCount: 1,
    });

    await expect(harness.service.processRequest(EMAIL, NOW)).resolves.toBe(
      "cooldown",
    );

    expect(harness.emailQueue.enqueue).not.toHaveBeenCalled();
    expect(harness.codes.generate).not.toHaveBeenCalled();
  });

  it("C5 caps code delivery at five sends per rolling day", async () => {
    const harness = createHarness();
    harness.seedClaim({
      lastCodeSentAt: new Date(NOW.getTime() - 61_000),
      codeWindowStartedAt: new Date(NOW.getTime() - 60 * 60_000),
      codeSentCount: 5,
    });

    await expect(harness.service.processRequest(EMAIL, NOW)).resolves.toBe(
      "max_sends",
    );

    expect(harness.emailQueue.enqueue).not.toHaveBeenCalled();
    expect(harness.codes.generate).not.toHaveBeenCalled();
  });

  it("C6 issues, pre-binds, and notifies once after a valid code", async () => {
    const harness = createHarness();
    const claim = harness.seedClaim();

    const result = await harness.service.confirm(RAW_EMAIL, CODE, NOW);

    expect(harness.licensing.issueLicenseForPurchase).toHaveBeenCalledTimes(1);
    const issueInput =
      harness.licensing.issueLicenseForPurchase.mock.calls[0]?.[0];
    expect(issueInput).toEqual({
      buyerEmail: EMAIL,
      buyerName: BUYER_NAME,
      productSku: "rastrackdash_student_claim",
      interval: "annual",
      now: NOW,
    });
    expect(issueInput).not.toHaveProperty("guruTransactionId");
    expect(harness.binding.bindIfNeeded).toHaveBeenCalledWith(
      "license-1",
      EMAIL,
      harness.prisma,
    );
    expect(harness.notifications.notifyLicenseIssued).toHaveBeenCalledTimes(1);
    expect(harness.notifications.notifyLicenseIssued).toHaveBeenCalledWith(
      expect.objectContaining({
        rawKey: RAW_KEY,
        phoneE164: null,
        reason: "issue",
      }),
    );
    expect(result).toEqual({
      status: "issued",
      licenseKey: RAW_KEY,
      accountIdentity: EMAIL,
      keyPrefix: "PALMUP-TEST",
      expiresAt: new Date(NOW.getTime() + 365 * DAY_MS).toISOString(),
      emailDelivery: "queued",
    });
    expect(harness.claims.get(EMAIL)).toMatchObject({
      id: claim.id,
      status: "issued",
      licenseId: "license-1",
      codeHash: null,
    });
  });

  it("C7 reveals the same key from the artifact without minting or notifying", async () => {
    const harness = createHarness();
    const license = harness.seedLicense();
    harness.seedArtifact(license.id);
    harness.seedClaim({ status: "issued", licenseId: license.id });

    const result = await harness.service.confirm(EMAIL, CODE, NOW);

    expect(result).toMatchObject({
      status: "issued",
      licenseKey: RAW_KEY,
      accountIdentity: EMAIL,
      emailDelivery: "not_resent",
    });
    expect(harness.deliverySecrets.decrypt).toHaveBeenCalledTimes(1);
    expect(harness.licensing.issueLicenseForPurchase).not.toHaveBeenCalled();
    expect(harness.notifications.notifyLicenseIssued).not.toHaveBeenCalled();
  });

  it("C8 sends an already-issued claim with an expired artifact to support", async () => {
    const harness = createHarness();
    const license = harness.seedLicense();
    harness.seedArtifact(license.id, {
      expiresAt: new Date(NOW.getTime() - 1),
    });
    harness.seedClaim({ status: "issued", licenseId: license.id });

    await expect(harness.service.confirm(EMAIL, CODE, NOW)).resolves.toEqual({
      status: "already_issued_contact_support",
    });

    expect(harness.deliverySecrets.decrypt).not.toHaveBeenCalled();
    expect(harness.licensing.issueLicenseForPurchase).not.toHaveBeenCalled();
  });

  it("C9 links and reveals an active Guru license with another SKU", async () => {
    const harness = createHarness();
    const guruLicense = harness.seedLicense({
      id: "guru-license",
      productSku: "guru-offer-123",
    });
    harness.seedArtifact(guruLicense.id);
    harness.seedClaim();

    const result = await harness.service.confirm(EMAIL, CODE, NOW);

    expect(result).toMatchObject({ status: "issued", licenseKey: RAW_KEY });
    expect(harness.claims.get(EMAIL)).toMatchObject({
      status: "issued",
      licenseId: guruLicense.id,
    });
    expect(harness.licensing.issueLicenseForPurchase).not.toHaveBeenCalled();
    expect(harness.notifications.notifyLicenseIssued).not.toHaveBeenCalled();
    expect(harness.licenses).toHaveLength(1);
  });

  it("C10 locks the code after five wrong attempts", async () => {
    const harness = createHarness();
    harness.seedClaim();

    const invalidBodies: Record<string, unknown>[] = [];
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const error = await harness.service
        .confirm(EMAIL, WRONG_CODE, NOW)
        .catch((caught: unknown) => caught);
      invalidBodies.push(expectInvalidCode(error));
    }
    const sixth = await harness.service
      .confirm(EMAIL, CODE, NOW)
      .catch((caught: unknown) => caught);

    expectInvalidCode(sixth);
    expect(
      new Set(invalidBodies.map((body) => JSON.stringify(body))).size,
    ).toBe(1);
    expect(harness.claims.get(EMAIL)).toMatchObject({
      codeAttempts: 5,
      codeHash: null,
      codeExpiresAt: null,
    });
    expect(harness.licensing.issueLicenseForPurchase).not.toHaveBeenCalled();
  });

  it("C11 rejects an expired code with the generic invalid response", async () => {
    const harness = createHarness();
    harness.seedClaim({ codeExpiresAt: new Date(NOW.getTime() - 1) });

    const error = await harness.service
      .confirm(EMAIL, CODE, NOW)
      .catch((caught: unknown) => caught);

    expectInvalidCode(error);
    expect(harness.licensing.issueLicenseForPurchase).not.toHaveBeenCalled();
  });

  it("C12 rejects a missing claim with the same generic invalid response", async () => {
    const harness = createHarness();

    const error = await harness.service
      .confirm(EMAIL, CODE, NOW)
      .catch((caught: unknown) => caught);

    expectInvalidCode(error);
    expect(harness.licensing.issueLicenseForPurchase).not.toHaveBeenCalled();
  });

  it("C13 atomically consumes a concurrent code and mints exactly once", async () => {
    const harness = createHarness();
    harness.seedClaim();

    const settled = await Promise.allSettled([
      harness.service.confirm(EMAIL, CODE, NOW),
      harness.service.confirm(EMAIL, CODE, NOW),
    ]);

    expect(harness.licensing.issueLicenseForPurchase).toHaveBeenCalledTimes(1);
    expect(harness.notifications.notifyLicenseIssued).toHaveBeenCalledTimes(1);
    expect(
      settled.filter((entry) => entry.status === "fulfilled"),
    ).toHaveLength(1);
    expect(settled.filter((entry) => entry.status === "rejected")).toHaveLength(
      1,
    );
    const rejected = settled.find((entry) => entry.status === "rejected");
    expect(rejected?.status).toBe("rejected");
    if (rejected?.status === "rejected") {
      const { status, body } = httpErrorBody(rejected.reason);
      expect(status).toBe(409);
      expect(body.code).toBe("license_claim_in_progress");
    }
    const consumeCalls =
      harness.prisma.licenseClaim.updateMany.mock.calls.filter(
        ([call]) => "codeHash" in call.where,
      );
    expect(consumeCalls).toHaveLength(2);
    expect(harness.claims.get(EMAIL)).toMatchObject({
      status: "issued",
      licenseId: "license-1",
      codeHash: null,
    });
  });

  it("C14 recovers a stale issuing row from an existing claim-SKU license", async () => {
    const harness = createHarness();
    const recoveredLicense = harness.seedLicense({
      id: "recovered-license",
      status: "refunded",
      expiresAt: new Date(NOW.getTime() - DAY_MS),
      productSku: "rastrackdash_student_claim",
    });
    harness.seedClaim({
      status: "issuing",
      updatedAt: new Date(NOW.getTime() - 3 * 60_000),
    });

    await expect(harness.service.confirm(EMAIL, CODE, NOW)).resolves.toEqual({
      status: "already_issued_contact_support",
    });

    expect(harness.claims.get(EMAIL)).toMatchObject({
      status: "issued",
      licenseId: recoveredLicense.id,
    });
    expect(harness.prisma.license.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          buyerEmail: EMAIL,
          productSku: "rastrackdash_student_claim",
        },
      }),
    );
    expect(harness.licensing.issueLicenseForPurchase).not.toHaveBeenCalled();
  });

  it("C15 forwards the normalized phone only when WhatsApp claim notify is on", async () => {
    const disabled = createHarness();
    disabled.seedClaim({ phoneE164: "5511999998888" });
    await disabled.service.confirm(EMAIL, CODE, NOW);

    const enabled = createHarness({
      env: { LICENSE_CLAIM_WHATSAPP_NOTIFY_ENABLED: "true" },
    });
    enabled.seedClaim({ phoneE164: "5511999998888" });
    await enabled.service.confirm(EMAIL, CODE, NOW);

    expect(disabled.notifications.notifyLicenseIssued).toHaveBeenCalledWith(
      expect.objectContaining({ phoneE164: null }),
    );
    expect(enabled.notifications.notifyLicenseIssued).toHaveBeenCalledWith(
      expect.objectContaining({ phoneE164: "5511999998888" }),
    );
  });

  it("C16 never logs the raw key, code, full email, or buyer name", async () => {
    const log = vi.spyOn(Logger.prototype, "log").mockImplementation(() => {});
    const warn = vi
      .spyOn(Logger.prototype, "warn")
      .mockImplementation(() => {});
    try {
      const harness = createHarness();
      await harness.service.processRequest(RAW_EMAIL, NOW);
      await harness.service.confirm(EMAIL, CODE, NOW);

      const output = [...log.mock.calls, ...warn.mock.calls]
        .flat()
        .map(String)
        .join("\n");
      expect(output).not.toContain(RAW_KEY);
      expect(output).not.toContain(CODE);
      expect(output).not.toContain(EMAIL);
      expect(output).not.toContain(BUYER_NAME);
    } finally {
      log.mockRestore();
      warn.mockRestore();
    }
  });
});
