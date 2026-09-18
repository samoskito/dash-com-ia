import { createHash } from "node:crypto";
import { HttpException, HttpStatus } from "@nestjs/common";
import type {
  License,
  LicenseActivation,
  LicenseHeartbeatStatus,
  LicenseInterval,
  LicenseStatus,
} from "@prisma/client";
import { describe, expect, it } from "vitest";
import { LicenseAccountBindingService } from "../src/licensing/license-account-binding.service";
import { LicenseCryptoService } from "../src/licensing/license-crypto.service";
import { hashLicenseKey } from "../src/licensing/license-key.generator";
import { LICENSE_GRACE_MS } from "../src/licensing/licensing.constants";
import { LicensingService } from "../src/licensing/licensing.service";

const RAW_KEY = "PALMUP-TEST-KEY1-KEY2-KEY3";
const KEY_HASH = hashLicenseKey(RAW_KEY);
const ACCOUNT = "samuel@rastrack.app";

type LicenseSeed = Partial<License> & Pick<License, "id">;

function daysFromNow(days: number, now = new Date()): Date {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}

function makeLicense(overrides: LicenseSeed = { id: "lic_1" }): License {
  const now = new Date();
  return {
    keyHash: KEY_HASH,
    keyPrefix: "PALMUP-TEST",
    buyerEmail: "buyer@example.com",
    buyerName: "Buyer",
    guruTransactionId: null,
    productSku: "rastrackdash_annual",
    interval: "annual",
    expiresAt: daysFromNow(365, now),
    status: "active",
    issuedAt: now,
    revokedAt: null,
    revokedReason: null,
    boundAccountEmail: null,
    boundAccountId: null,
    boundAt: null,
    nodApiEnabled: false,
    nodApiExpiresAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createPrismaMock(seed: License[] = []) {
  const licenses = new Map<string, License>(seed.map((row) => [row.id, { ...row }]));
  const activations = new Map<string, LicenseActivation>();

  const activationKey = (licenseId: string, fingerprint: string) =>
    `${licenseId}::${fingerprint}`;

  const prisma = {
    license: {
      findUnique: async ({
        where,
        include,
      }: {
        where: { id?: string; keyHash?: string; guruTransactionId?: string };
        include?: {
          activations?: { orderBy?: { lastHeartbeatAt: "asc" | "desc" } };
        };
      }) => {
        let row: License | null = null;
        if (where.id) {
          row = licenses.get(where.id) ?? null;
        } else if (where.keyHash) {
          row =
            [...licenses.values()].find((item) => item.keyHash === where.keyHash) ??
            null;
        } else if (where.guruTransactionId) {
          row =
            [...licenses.values()].find(
              (item) => item.guruTransactionId === where.guruTransactionId,
            ) ?? null;
        }
        if (!row) {
          return null;
        }
        if (!include?.activations) {
          return row;
        }
        const related = [...activations.values()].filter(
          (activation) => activation.licenseId === row.id,
        );
        if (include.activations.orderBy?.lastHeartbeatAt === "desc") {
          related.sort(
            (left, right) =>
              right.lastHeartbeatAt.getTime() - left.lastHeartbeatAt.getTime(),
          );
        }
        return { ...row, activations: related };
      },
      findFirst: async ({
        where,
        orderBy,
      }: {
        where?: {
          buyerEmail?: string;
          productSku?: string;
          status?: LicenseStatus;
          expiresAt?: { gt?: Date };
        };
        orderBy?: Array<Record<string, "asc" | "desc">> | Record<string, "asc" | "desc">;
      }) => {
        let rows = [...licenses.values()];
        if (where?.buyerEmail) {
          rows = rows.filter((item) => item.buyerEmail === where.buyerEmail);
        }
        if (where?.productSku) {
          rows = rows.filter((item) => item.productSku === where.productSku);
        }
        if (where?.status) {
          rows = rows.filter((item) => item.status === where.status);
        }
        if (where?.expiresAt?.gt) {
          const min = where.expiresAt.gt;
          rows = rows.filter((item) => item.expiresAt.getTime() > min.getTime());
        }
        rows.sort((a, b) => b.issuedAt.getTime() - a.issuedAt.getTime());
        return rows[0] ?? null;
      },
      findMany: async ({
        where,
        orderBy,
        take,
        skip,
      }: {
        where?: {
          status?: LicenseStatus;
          OR?: Array<{
            buyerEmail?: { contains: string; mode?: string };
            boundAccountEmail?: { contains: string; mode?: string };
          }>;
        };
        orderBy?: { issuedAt: "asc" | "desc" };
        take?: number;
        skip?: number;
      }) => {
        let rows = [...licenses.values()];
        if (where?.status) {
          rows = rows.filter((item) => item.status === where.status);
        }
        if (where?.OR?.length) {
          rows = rows.filter((item) =>
            where.OR!.some((clause) => {
              const buyer = clause.buyerEmail?.contains.toLowerCase();
              const bound = clause.boundAccountEmail?.contains.toLowerCase();
              return (
                (buyer != null &&
                  item.buyerEmail?.toLowerCase().includes(buyer)) ||
                (bound != null &&
                  item.boundAccountEmail?.toLowerCase().includes(bound))
              );
            }),
          );
        }
        if (orderBy?.issuedAt === "desc") {
          rows.sort((left, right) => right.issuedAt.getTime() - left.issuedAt.getTime());
        } else if (orderBy?.issuedAt === "asc") {
          rows.sort((left, right) => left.issuedAt.getTime() - right.issuedAt.getTime());
        }
        const start = skip ?? 0;
        return rows.slice(start, take == null ? undefined : start + take);
      },
      count: async ({
        where,
      }: {
        where?: {
          status?: LicenseStatus;
          OR?: Array<{
            buyerEmail?: { contains: string; mode?: string };
            boundAccountEmail?: { contains: string; mode?: string };
          }>;
        };
      }) => {
        const { findMany } = prisma.license;
        const rows = await findMany({ where });
        return rows.length;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<License>;
      }) => {
        const current = licenses.get(where.id);
        if (!current) {
          throw new Error("license not found");
        }
        const next = { ...current, ...data, updatedAt: new Date() };
        licenses.set(where.id, next);
        return next;
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: {
          id: string;
          boundAccountEmail?: string | null;
          boundAccountId?: string | null;
        };
        data: Partial<License>;
      }) => {
        const current = licenses.get(where.id);
        if (!current) {
          return { count: 0 };
        }
        if (
          Object.prototype.hasOwnProperty.call(where, "boundAccountEmail") &&
          current.boundAccountEmail !== where.boundAccountEmail
        ) {
          return { count: 0 };
        }
        if (
          Object.prototype.hasOwnProperty.call(where, "boundAccountId") &&
          current.boundAccountId !== where.boundAccountId
        ) {
          return { count: 0 };
        }
        licenses.set(where.id, { ...current, ...data, updatedAt: new Date() });
        return { count: 1 };
      },
      create: async ({ data }: { data: Partial<License> }) => {
        const now = new Date();
        const row = makeLicense({
          id: `lic_${licenses.size + 1}`,
          issuedAt: now,
          createdAt: now,
          updatedAt: now,
          ...data,
        } as LicenseSeed);
        licenses.set(row.id, row);
        return row;
      },
    },
    licenseActivation: {
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { licenseId_fingerprint: { licenseId: string; fingerprint: string } };
        create: Partial<LicenseActivation> & {
          licenseId: string;
          fingerprint: string;
        };
        update: Partial<LicenseActivation>;
      }) => {
        const key = activationKey(
          where.licenseId_fingerprint.licenseId,
          where.licenseId_fingerprint.fingerprint,
        );
        const existing = activations.get(key);
        if (!existing) {
          const now = new Date();
          const row: LicenseActivation = {
            id: `act_${activations.size + 1}`,
            licenseId: create.licenseId,
            fingerprint: create.fingerprint,
            appVersion: create.appVersion ?? null,
            deployLabel: create.deployLabel ?? null,
            firstActivatedAt: create.firstActivatedAt ?? now,
            lastHeartbeatAt: create.lastHeartbeatAt ?? now,
            lastHeartbeatStatus: (create.lastHeartbeatStatus ??
              "ok") as LicenseHeartbeatStatus,
            ipAddress: create.ipAddress ?? null,
          };
          activations.set(key, row);
          return row;
        }
        const next = { ...existing, ...update };
        activations.set(key, next);
        return next;
      },
      findUnique: async ({
        where,
      }: {
        where: {
          id?: string;
          licenseId_fingerprint?: { licenseId: string; fingerprint: string };
        };
      }) => {
        if (where.id) {
          return (
            [...activations.values()].find((row) => row.id === where.id) ?? null
          );
        }
        if (where.licenseId_fingerprint) {
          return (
            activations.get(
              activationKey(
                where.licenseId_fingerprint.licenseId,
                where.licenseId_fingerprint.fingerprint,
              ),
            ) ?? null
          );
        }
        return null;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<LicenseActivation>;
      }) => {
        const entry = [...activations.entries()].find(
          ([, row]) => row.id === where.id,
        );
        if (!entry) {
          throw new Error("activation not found");
        }
        const next = { ...entry[1], ...data };
        activations.set(entry[0], next);
        return next;
      },
    },
  };

  return { prisma, licenses, activations };
}

function createService(seed: License[] = []) {
  const { prisma, licenses, activations } = createPrismaMock(seed);
  const pair = LicenseCryptoService.generateEphemeralKeyPair();
  const crypto = new LicenseCryptoService({
    LICENSE_SIGNING_PRIVATE_KEY: pair.privateKeyPem,
    LICENSE_SIGNING_PUBLIC_KEY: pair.publicKeyPem,
  });
  const service = new LicensingService(
    prisma as never,
    crypto,
    new LicenseAccountBindingService(),
  );
  return { service, crypto, prisma, licenses, activations };
}

function httpError(error: unknown): { status: number; body: Record<string, unknown> } {
  expect(error).toBeInstanceOf(HttpException);
  const exception = error as HttpException;
  const response = exception.getResponse();
  const body =
    typeof response === "string"
      ? { message: response }
      : (response as Record<string, unknown>);
  return { status: exception.getStatus(), body };
}

describe("licensing service", () => {
  it("activate binds account on first use and never echoes the raw key", async () => {
    const { service, crypto, licenses, activations } = createService([
      makeLicense({ id: "lic_1" }),
    ]);

    const result = await service.activate({
      key: RAW_KEY,
      fingerprint: "fp-a",
      accountIdentity: `  ${ACCOUNT.toUpperCase()}  `,
      appVersion: "1.0.0",
      deployLabel: "aluno-1",
      ipAddress: "203.0.113.10",
    });

    const bound = licenses.get("lic_1");
    expect(bound?.boundAccountEmail).toBe(ACCOUNT);
    expect(bound?.boundAt).toBeInstanceOf(Date);
    expect(activations.size).toBe(1);
    expect(result.bound).toBe(true);
    expect(result.status).toBe("active");
    expect(result.softLock).toBe(false);
    expect(result.hardLock).toBe(false);
    expect(JSON.stringify(result)).not.toContain(RAW_KEY);
    expect(result.cacheToken).toBeTruthy();

    const payload = crypto.verifyCache(result.cacheToken);
    expect(payload?.status).toBe("active");
    expect(payload?.licenseKeyHash).toBe(KEY_HASH);
    expect(payload?.accountIdentityHash).toBe(
      createHash("sha256").update(ACCOUNT, "utf8").digest("hex"),
    );
  });

  it("allows a second fingerprint for the same bound account", async () => {
    const { service, activations } = createService([makeLicense({ id: "lic_1" })]);

    await service.activate({
      key: RAW_KEY,
      fingerprint: "fp-a",
      accountIdentity: ACCOUNT,
    });
    const second = await service.activate({
      key: RAW_KEY,
      fingerprint: "fp-b",
      accountIdentity: ACCOUNT,
    });

    expect(second.bound).toBe(true);
    expect(second.status).toBe("active");
    expect(activations.size).toBe(2);
  });

  it("rejects a different account with 403 license_account_mismatch", async () => {
    const { service, activations } = createService([makeLicense({ id: "lic_1" })]);

    await service.activate({
      key: RAW_KEY,
      fingerprint: "fp-a",
      accountIdentity: ACCOUNT,
    });

    const error = await service
      .activate({
        key: RAW_KEY,
        fingerprint: "fp-attacker",
        accountIdentity: "outro@aluno.com",
      })
      .catch((caught: unknown) => caught);

    const { status, body } = httpError(error);
    expect(status).toBe(HttpStatus.FORBIDDEN);
    expect(body.code).toBe("license_account_mismatch");
    expect(
      [...activations.values()].some((row) => row.fingerprint === "fp-attacker"),
    ).toBe(false);
  });

  it("blocks refunded licenses with softLock", async () => {
    const { service } = createService([
      makeLicense({ id: "lic_1", status: "refunded" as LicenseStatus }),
    ]);

    const error = await service
      .activate({
        key: RAW_KEY,
        fingerprint: "fp-a",
        accountIdentity: ACCOUNT,
      })
      .catch((caught: unknown) => caught);

    const { status, body } = httpError(error);
    expect(status).toBe(HttpStatus.FORBIDDEN);
    expect(body.code).toBe("license_blocked");
    expect(body.softLock).toBe(true);
    expect(body.hardLock).toBe(false);
  });

  it("hard-locks a fraud revocation", async () => {
    const { service } = createService([
      makeLicense({
        id: "lic_1",
        status: "revoked" as LicenseStatus,
        revokedReason: "fraud:chargeback-abuse",
        revokedAt: new Date(),
      }),
    ]);

    const error = await service
      .activate({
        key: RAW_KEY,
        fingerprint: "fp-a",
        accountIdentity: ACCOUNT,
      })
      .catch((caught: unknown) => caught);

    const { status, body } = httpError(error);
    expect(status).toBe(HttpStatus.FORBIDDEN);
    expect(body.code).toBe("license_blocked");
    expect(body.hardLock).toBe(true);
    expect(body.softLock).toBe(false);
  });

  it("treats expiry within 72h as grace and still usable", async () => {
    const now = new Date();
    const { service } = createService([
      makeLicense({
        id: "lic_1",
        expiresAt: new Date(now.getTime() - LICENSE_GRACE_MS / 2),
      }),
    ]);

    const result = await service.activate({
      key: RAW_KEY,
      fingerprint: "fp-a",
      accountIdentity: ACCOUNT,
    });

    expect(result.status).toBe("grace");
    expect(result.softLock).toBe(false);
    expect(result.hardLock).toBe(false);
  });

  it("blocks expiry beyond 72h", async () => {
    const now = new Date();
    const { service } = createService([
      makeLicense({
        id: "lic_1",
        expiresAt: new Date(now.getTime() - LICENSE_GRACE_MS - 1000),
      }),
    ]);

    const error = await service
      .activate({
        key: RAW_KEY,
        fingerprint: "fp-a",
        accountIdentity: ACCOUNT,
      })
      .catch((caught: unknown) => caught);

    const { status, body } = httpError(error);
    expect(status).toBe(HttpStatus.FORBIDDEN);
    expect(body.code).toBe("license_blocked");
    expect(body.softLock).toBe(true);
    expect(body.hardLock).toBe(false);
  });

  it("rejects an invalid key", async () => {
    const { service } = createService([makeLicense({ id: "lic_1" })]);

    const error = await service
      .activate({
        key: "PALMUP-FAKE-FAKE-FAKE-FAKE",
        fingerprint: "fp-a",
        accountIdentity: ACCOUNT,
      })
      .catch((caught: unknown) => caught);

    const { status, body } = httpError(error);
    expect([HttpStatus.UNAUTHORIZED, HttpStatus.FORBIDDEN]).toContain(status);
    expect(body.code).toBe("license_invalid");
  });

  it("heartbeat refreshes the signed cache and updates telemetry", async () => {
    const { service, crypto, activations } = createService([
      makeLicense({ id: "lic_1" }),
    ]);

    await service.activate({
      key: RAW_KEY,
      fingerprint: "fp-a",
      accountIdentity: ACCOUNT,
    });

    const beat = await service.heartbeat({
      key: RAW_KEY,
      fingerprint: "fp-a",
      ipAddress: "198.51.100.20",
    });

    expect(beat.status).toBe("active");
    expect(crypto.verifyCache(beat.cacheToken)?.status).toBe("active");
    const activation = [...activations.values()][0];
    expect(activation?.lastHeartbeatStatus).toBe("ok");
    expect(activation?.ipAddress).toBe("198.51.100.20");
  });

  it("heartbeat on a blocked license still updates existing telemetry", async () => {
    const { service, crypto, licenses, activations } = createService([
      makeLicense({ id: "lic_1" }),
    ]);

    await service.activate({
      key: RAW_KEY,
      fingerprint: "fp-a",
      accountIdentity: ACCOUNT,
    });

    const current = licenses.get("lic_1");
    if (!current) {
      throw new Error("expected seed license");
    }
    licenses.set("lic_1", { ...current, status: "chargeback" });

    const beat = await service.heartbeat({
      key: RAW_KEY,
      fingerprint: "fp-a",
    });

    expect(beat.status).toBe("blocked");
    expect(beat.softLock).toBe(true);
    expect(crypto.verifyCache(beat.cacheToken)?.status).toBe("blocked");
    expect([...activations.values()][0]?.lastHeartbeatStatus).toBe("stale");
  });

  it("issues a purchase license without persisting the raw key", async () => {
    const { service, licenses } = createService();
    const now = new Date("2026-08-19T12:00:00.000Z");

    const issued = await service.issueLicenseForPurchase({
      buyerEmail: "aluno@example.com",
      buyerName: "Aluno",
      interval: "annual" as LicenseInterval,
      now,
    });

    expect(issued.created).toBe(true);
    expect(issued.rawKey).toMatch(/^PALMUP-[A-Z2-7]{4}-[A-Z2-7]{4}-[A-Z2-7]{4}-[A-Z2-7]{4}$/);
    expect(issued.rawKey).toBeTruthy();
    expect(issued.license.keyHash).toBe(hashLicenseKey(issued.rawKey!));
    expect(issued.license.status).toBe("active");
    expect(issued.license.expiresAt.toISOString()).toBe(
      new Date("2027-08-19T12:00:00.000Z").toISOString(),
    );
    expect(JSON.stringify([...licenses.values()])).not.toContain(issued.rawKey!);
  });

  it("lists licenses newest first without leaking keyHash", async () => {
    const older = makeLicense({
      id: "lic_old",
      buyerEmail: "old@example.com",
      issuedAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    const newer = makeLicense({
      id: "lic_new",
      buyerEmail: "new@example.com",
      issuedAt: new Date("2026-08-01T00:00:00.000Z"),
    });
    const { service } = createService([older, newer]);

    const listed = await service.listLicenses({ take: 50, skip: 0 });

    expect(listed.total).toBe(2);
    expect(listed.items.map((item) => item.id)).toEqual(["lic_new", "lic_old"]);
    expect(JSON.stringify(listed)).not.toContain("keyHash");
    expect(JSON.stringify(listed)).not.toContain(KEY_HASH);
  });

  it("returns 404 when admin fetches a missing license", async () => {
    const { service } = createService([makeLicense({ id: "lic_1" })]);

    const error = await service.getLicense("missing").catch((caught: unknown) => caught);
    const { status, body } = httpError(error);
    expect(status).toBe(HttpStatus.NOT_FOUND);
    expect(String(body.message)).toContain("Licenca");
  });

  it("revokes a license with reason and rebinds by email", async () => {
    const { service, licenses } = createService([
      makeLicense({
        id: "lic_1",
        boundAccountEmail: "old@aluno.com",
        boundAccountId: "legacy-id",
        boundAt: new Date("2026-01-01T00:00:00.000Z"),
      }),
    ]);

    const revoked = await service.revokeLicense("lic_1", "fraude confirmada");
    expect(revoked.status).toBe("revoked");
    expect(revoked.revokedReason).toBe("fraude confirmada");
    expect(revoked.revokedAt).toBeTruthy();
    expect(licenses.get("lic_1")?.status).toBe("revoked");

    const rebound = await service.rebindLicense("lic_1", "  Novo@Aluno.com  ");
    expect(rebound.boundAccountEmail).toBe("novo@aluno.com");
    expect(rebound.boundAccountId).toBeNull();
    expect(licenses.get("lic_1")?.boundAccountId).toBeNull();
  });

  it("sets nod api entitlement without changing omitted expiry", async () => {
    const expires = new Date("2026-12-01T00:00:00.000Z");
    const { service, licenses } = createService([
      makeLicense({
        id: "lic_1",
        nodApiEnabled: false,
        nodApiExpiresAt: expires,
      }),
    ]);

    const updated = await service.setNodApi("lic_1", { enabled: true });
    expect(updated.nodApiEnabled).toBe(true);
    expect(updated.nodApiExpiresAt).toBe(expires.toISOString());
    expect(licenses.get("lic_1")?.nodApiExpiresAt).toEqual(expires);
  });

  it("reuses an existing active license for the same guruTransactionId without a new raw key", async () => {
    const { service, licenses } = createService();
    const first = await service.issueLicenseForPurchase({
      buyerEmail: "aluno@example.com",
      buyerName: "Aluno",
      guruTransactionId: "sub_dedupe",
      productSku: "rastrackdash_annual",
    });
    const second = await service.issueLicenseForPurchase({
      buyerEmail: "aluno@example.com",
      buyerName: "Aluno",
      guruTransactionId: "sub_dedupe",
      productSku: "rastrackdash_annual",
    });
    expect(first.created).toBe(true);
    expect(first.rawKey).toBeTruthy();
    expect(second.created).toBe(false);
    expect(second.rawKey).toBeNull();
    expect(second.license.id).toBe(first.license.id);
    expect(licenses.size).toBe(1);
  });

});