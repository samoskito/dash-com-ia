-- CreateEnum
CREATE TYPE "LicenseInterval" AS ENUM ('annual', 'monthly', 'semiannual');

-- CreateEnum
CREATE TYPE "LicenseStatus" AS ENUM ('active', 'refunded', 'chargeback', 'revoked');

-- CreateEnum
CREATE TYPE "LicenseHeartbeatStatus" AS ENUM ('ok', 'stale');

-- CreateTable
CREATE TABLE "License" (
    "id" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "buyerEmail" TEXT,
    "buyerName" TEXT,
    "guruTransactionId" TEXT,
    "productSku" TEXT NOT NULL DEFAULT 'rastrackdash_annual',
    "interval" "LicenseInterval" NOT NULL DEFAULT 'annual',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" "LicenseStatus" NOT NULL DEFAULT 'active',
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,
    "boundAccountEmail" TEXT,
    "boundAccountId" TEXT,
    "boundAt" TIMESTAMP(3),
    "nodApiEnabled" BOOLEAN NOT NULL DEFAULT false,
    "nodApiExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "License_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LicenseActivation" (
    "id" TEXT NOT NULL,
    "licenseId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "appVersion" TEXT,
    "deployLabel" TEXT,
    "firstActivatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastHeartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastHeartbeatStatus" "LicenseHeartbeatStatus" NOT NULL DEFAULT 'ok',
    "ipAddress" TEXT,

    CONSTRAINT "LicenseActivation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LicenseWebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'guru',
    "eventType" TEXT NOT NULL,
    "externalTransactionId" TEXT NOT NULL,
    "signatureValid" BOOLEAN NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "resultStatus" TEXT NOT NULL,
    "rawPayloadSanitized" JSONB,

    CONSTRAINT "LicenseWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "License_keyHash_key" ON "License"("keyHash");

-- CreateIndex
CREATE UNIQUE INDEX "License_guruTransactionId_key" ON "License"("guruTransactionId");

-- CreateIndex
CREATE INDEX "License_status_issuedAt_idx" ON "License"("status", "issuedAt");

-- CreateIndex
CREATE INDEX "License_buyerEmail_idx" ON "License"("buyerEmail");

-- CreateIndex
CREATE INDEX "License_boundAccountEmail_idx" ON "License"("boundAccountEmail");

-- CreateIndex
CREATE INDEX "License_expiresAt_status_idx" ON "License"("expiresAt", "status");

-- CreateIndex
CREATE INDEX "LicenseActivation_licenseId_idx" ON "LicenseActivation"("licenseId");

-- CreateIndex
CREATE INDEX "LicenseActivation_lastHeartbeatAt_idx" ON "LicenseActivation"("lastHeartbeatAt");

-- CreateIndex
CREATE UNIQUE INDEX "LicenseActivation_licenseId_fingerprint_key" ON "LicenseActivation"("licenseId", "fingerprint");

-- CreateIndex
CREATE INDEX "LicenseWebhookEvent_provider_receivedAt_idx" ON "LicenseWebhookEvent"("provider", "receivedAt");

-- CreateIndex
CREATE INDEX "LicenseWebhookEvent_resultStatus_receivedAt_idx" ON "LicenseWebhookEvent"("resultStatus", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "LicenseWebhookEvent_provider_externalTransactionId_key" ON "LicenseWebhookEvent"("provider", "externalTransactionId");

-- AddForeignKey
ALTER TABLE "LicenseActivation" ADD CONSTRAINT "LicenseActivation_licenseId_fkey" FOREIGN KEY ("licenseId") REFERENCES "License"("id") ON DELETE CASCADE ON UPDATE CASCADE;
