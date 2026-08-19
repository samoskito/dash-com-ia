import { createHash } from "node:crypto";
import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import type { License, LicenseHeartbeatStatus, LicenseInterval } from "@prisma/client";
import { PrismaService } from "../common/prisma/prisma.service";
import { LicenseAccountBindingService } from "./license-account-binding.service";
import { LicenseCryptoService } from "./license-crypto.service";
import {
  generateRawLicenseKey,
  hashLicenseKey,
  keyPrefixFromRaw,
} from "./license-key.generator";
import { LICENSE_GRACE_MS } from "./licensing.constants";
import type {
  ActivateLicenseInput,
  HeartbeatLicenseInput,
  IssueLicenseForPurchaseInput,
  IssuedLicense,
  LicenseActionResult,
  LicenseRuntimeState,
} from "./licensing.types";

const DEFAULT_PRODUCT_SKU = "rastrackdash_annual";

function requireText(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new HttpException(
      {
        statusCode: HttpStatus.BAD_REQUEST,
        code: "license_invalid_request",
        message: `${field} is required`,
      },
      HttpStatus.BAD_REQUEST,
    );
  }
  return value;
}

function isTerminalStatus(status: License["status"]): boolean {
  return status === "refunded" || status === "chargeback" || status === "revoked";
}

function isFraudReason(reason: string | null | undefined): boolean {
  if (!reason) {
    return false;
  }
  const normalized = reason.trim().toLowerCase();
  return normalized === "fraud" || normalized.startsWith("fraud:");
}

function addInterval(now: Date, interval: LicenseInterval): Date {
  const expires = new Date(now.getTime());
  if (interval === "monthly") {
    expires.setUTCMonth(expires.getUTCMonth() + 1);
    return expires;
  }
  if (interval === "semiannual") {
    expires.setUTCMonth(expires.getUTCMonth() + 6);
    return expires;
  }
  expires.setUTCFullYear(expires.getUTCFullYear() + 1);
  return expires;
}

function hashAccountIdentity(identity: string): string {
  return createHash("sha256").update(identity, "utf8").digest("hex");
}

function throwInvalidLicense(): never {
  throw new HttpException(
    {
      statusCode: HttpStatus.UNAUTHORIZED,
      code: "license_invalid",
      message: "Licença inválida.",
    },
    HttpStatus.UNAUTHORIZED,
  );
}

function throwBlockedLicense(state: LicenseRuntimeState): never {
  throw new HttpException(
    {
      statusCode: HttpStatus.FORBIDDEN,
      code: "license_blocked",
      message: "Licença bloqueada.",
      softLock: state.softLock,
      hardLock: state.hardLock,
    },
    HttpStatus.FORBIDDEN,
  );
}

@Injectable()
export class LicensingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: LicenseCryptoService,
    private readonly binding: LicenseAccountBindingService,
  ) {}

  deriveRuntimeState(license: License, now = new Date()): LicenseRuntimeState {
    if (isTerminalStatus(license.status)) {
      const hardLock =
        license.status === "revoked" && isFraudReason(license.revokedReason);
      return {
        status: "blocked",
        softLock: !hardLock,
        hardLock,
        usable: false,
      };
    }

    if (license.expiresAt.getTime() <= now.getTime()) {
      const expiredFor = now.getTime() - license.expiresAt.getTime();
      if (expiredFor <= LICENSE_GRACE_MS) {
        return {
          status: "grace",
          softLock: false,
          hardLock: false,
          usable: true,
        };
      }
      return {
        status: "blocked",
        softLock: true,
        hardLock: false,
        usable: false,
      };
    }

    return {
      status: "active",
      softLock: false,
      hardLock: false,
      usable: true,
    };
  }

  async issueLicenseForPurchase(
    input: IssueLicenseForPurchaseInput,
  ): Promise<IssuedLicense> {
    const now = input.now ?? new Date();
    const interval = input.interval ?? "annual";
    const rawKey = generateRawLicenseKey();
    const keyHash = hashLicenseKey(rawKey);
    const license = await this.prisma.license.create({
      data: {
        keyHash,
        keyPrefix: keyPrefixFromRaw(rawKey),
        buyerEmail: input.buyerEmail ?? null,
        buyerName: input.buyerName ?? null,
        guruTransactionId: input.guruTransactionId ?? undefined,
        productSku: input.productSku ?? DEFAULT_PRODUCT_SKU,
        interval,
        expiresAt: addInterval(now, interval),
        status: "active",
        issuedAt: now,
      },
    });
    return { license, rawKey };
  }

  async activate(input: ActivateLicenseInput): Promise<LicenseActionResult> {
    const key = requireText(input.key, "key");
    const fingerprint = requireText(input.fingerprint, "fingerprint");
    const accountIdentity = requireText(input.accountIdentity, "accountIdentity");
    const now = new Date();

    const license = await this.findLicenseByKey(key);
    const state = this.deriveRuntimeState(license, now);
    if (!state.usable) {
      throwBlockedLicense(state);
    }

    const bound = await this.binding.bindIfNeeded(
      license.id,
      accountIdentity,
      this.prisma,
    );

    await this.prisma.licenseActivation.upsert({
      where: {
        licenseId_fingerprint: {
          licenseId: license.id,
          fingerprint,
        },
      },
      create: {
        licenseId: license.id,
        fingerprint,
        appVersion: input.appVersion,
        deployLabel: input.deployLabel,
        ipAddress: input.ipAddress,
        firstActivatedAt: now,
        lastHeartbeatAt: now,
        lastHeartbeatStatus: "ok",
      },
      update: {
        appVersion: input.appVersion,
        deployLabel: input.deployLabel,
        ipAddress: input.ipAddress,
        lastHeartbeatAt: now,
        lastHeartbeatStatus: "ok",
      },
    });

    const identity = this.binding.normalizeAccountIdentity(accountIdentity);
    return this.toActionResult(bound, identity, now);
  }

  async heartbeat(input: HeartbeatLicenseInput): Promise<LicenseActionResult> {
    const key = requireText(input.key, "key");
    const fingerprint = requireText(input.fingerprint, "fingerprint");
    const now = new Date();

    const license = await this.findLicenseByKey(key);
    const state = this.deriveRuntimeState(license, now);

    const activation = await this.prisma.licenseActivation.findUnique({
      where: {
        licenseId_fingerprint: {
          licenseId: license.id,
          fingerprint,
        },
      },
    });

    if (activation) {
      const lastHeartbeatStatus: LicenseHeartbeatStatus = state.usable
        ? "ok"
        : "stale";
      await this.prisma.licenseActivation.update({
        where: { id: activation.id },
        data: {
          lastHeartbeatAt: now,
          lastHeartbeatStatus,
          ipAddress: input.ipAddress ?? activation.ipAddress,
        },
      });
    }

    const identity = license.boundAccountEmail ?? license.boundAccountId ?? undefined;
    return this.toActionResult(license, identity, now);
  }

  private async findLicenseByKey(rawKey: string): Promise<License> {
    const license = await this.prisma.license.findUnique({
      where: { keyHash: hashLicenseKey(rawKey) },
    });
    if (!license) {
      throwInvalidLicense();
    }
    return license;
  }

  private buildSignedCache(
    license: License,
    accountIdentityHash: string | undefined,
    now: Date,
  ) {
    const runtime = this.deriveRuntimeState(license, now);
    const validUntil = runtime.usable
      ? new Date(now.getTime() + LICENSE_GRACE_MS)
      : now;
    const cacheToken = this.crypto.signCache({
      licenseKeyHash: license.keyHash,
      status: runtime.status,
      expiresAt: license.expiresAt.toISOString(),
      issuedAt: license.issuedAt.toISOString(),
      validUntil: validUntil.toISOString(),
      iat: Math.floor(now.getTime() / 1000),
      accountIdentityHash,
      softLock: runtime.softLock,
      hardLock: runtime.hardLock,
    });
    return { runtime, validUntil, cacheToken };
  }

  private toActionResult(
    license: License,
    accountIdentity: string | undefined,
    now: Date,
  ): LicenseActionResult {
    const accountIdentityHash = accountIdentity
      ? hashAccountIdentity(accountIdentity)
      : undefined;
    const { runtime, validUntil, cacheToken } = this.buildSignedCache(
      license,
      accountIdentityHash,
      now,
    );
    return {
      status: runtime.status,
      softLock: runtime.softLock,
      hardLock: runtime.hardLock,
      expiresAt: license.expiresAt.toISOString(),
      validUntil: validUntil.toISOString(),
      cacheToken,
      bound: Boolean(license.boundAccountEmail ?? license.boundAccountId),
      keyPrefix: license.keyPrefix,
    };
  }
}
