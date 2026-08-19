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
  /** Present only on first issue. Null when an existing license was reused (dedupe). */
  rawKey: string | null;
  created: boolean;
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

export type AdminLicenseActivationView = {
  id: string;
  fingerprint: string;
  appVersion: string | null;
  deployLabel: string | null;
  firstActivatedAt: string;
  lastHeartbeatAt: string;
  lastHeartbeatStatus: string;
  ipAddress: string | null;
};

/** Admin view never includes keyHash or the raw key (raw is not stored). */
export type AdminLicenseView = {
  id: string;
  keyPrefix: string;
  buyerEmail: string | null;
  buyerName: string | null;
  guruTransactionId: string | null;
  productSku: string;
  interval: string;
  expiresAt: string;
  status: string;
  issuedAt: string;
  revokedAt: string | null;
  revokedReason: string | null;
  boundAccountEmail: string | null;
  boundAccountId: string | null;
  boundAt: string | null;
  nodApiEnabled: boolean;
  nodApiExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  activations?: AdminLicenseActivationView[];
};

export type AdminLicenseList = {
  items: AdminLicenseView[];
  total: number;
};

export type ListLicensesQuery = {
  status?: string;
  email?: string;
  take?: number;
  skip?: number;
};

export type SetNodApiInput = {
  enabled: boolean;
  expiresAt?: Date | null;
};
