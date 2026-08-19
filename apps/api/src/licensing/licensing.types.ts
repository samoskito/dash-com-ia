import type { License, LicenseInterval } from "@prisma/client";

export type LicenseRuntimeStatus = "active" | "grace" | "blocked";

export type LicenseRuntimeState = {
  status: LicenseRuntimeStatus;
  softLock: boolean;
  hardLock: boolean;
  usable: boolean;
};

export type ActivateLicenseInput = {
  key: string;
  fingerprint: string;
  accountIdentity: string;
  appVersion?: string;
  deployLabel?: string;
  ipAddress?: string;
};

export type HeartbeatLicenseInput = {
  key: string;
  fingerprint: string;
  ipAddress?: string;
};

export type IssueLicenseForPurchaseInput = {
  buyerEmail?: string | null;
  buyerName?: string | null;
  guruTransactionId?: string | null;
  productSku?: string;
  interval?: LicenseInterval;
  now?: Date;
};

export type IssuedLicense = {
  license: License;
  rawKey: string;
};

export type LicenseActionResult = {
  status: LicenseRuntimeStatus;
  softLock: boolean;
  hardLock: boolean;
  expiresAt: string;
  validUntil: string;
  cacheToken: string;
  bound: boolean;
  keyPrefix: string;
};
