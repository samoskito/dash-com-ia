-- Package billing runtime persistence remains additive. This migration does
-- not promote legacy contracts or enable billing enforcement.

ALTER TABLE "WorkspaceSubscription"
ADD COLUMN "asaasCheckoutUrl" TEXT,
ADD COLUMN "asaasCheckoutExpiresAt" TIMESTAMP(3),
ADD COLUMN "recurrenceStoppedAt" TIMESTAMP(3),
ADD COLUMN "lastPaymentConfirmedAt" TIMESTAMP(3);

ALTER TABLE "PaymentCharge"
ADD COLUMN "subscriptionId" TEXT;

CREATE TABLE "PlatformFiscalSettings" (
    "id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "effectiveDatePeriod" TEXT NOT NULL DEFAULT 'ON_PAYMENT_CONFIRMATION',
    "municipalServiceId" TEXT,
    "municipalServiceCode" TEXT,
    "serviceDescription" TEXT NOT NULL,
    "observations" TEXT,
    "taxes" JSONB,
    "validatedAt" TIMESTAMP(3),
    "validatedByUserId" TEXT,
    "validationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformFiscalSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BillingInvoice" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "paymentChargeId" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'asaas',
    "providerInvoiceId" TEXT,
    "providerPaymentId" TEXT,
    "status" "BillingInvoiceStatus" NOT NULL DEFAULT 'pending_configuration',
    "amountCents" INTEGER,
    "issuedAt" TIMESTAMP(3),
    "authorizedAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "lastErrorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingInvoice_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "PlatformFiscalSettings"
ADD CONSTRAINT "PlatformFiscalSettings_effectiveDatePeriod_check"
CHECK ("effectiveDatePeriod" = 'ON_PAYMENT_CONFIRMATION'),
ADD CONSTRAINT "PlatformFiscalSettings_service_reference_check"
CHECK (
  "enabled" = false
  OR "municipalServiceId" IS NOT NULL
  OR "municipalServiceCode" IS NOT NULL
);

ALTER TABLE "BillingInvoice"
ADD CONSTRAINT "BillingInvoice_amountCents_check"
CHECK ("amountCents" IS NULL OR "amountCents" >= 0),
ADD CONSTRAINT "BillingInvoice_retryCount_check"
CHECK ("retryCount" >= 0);

CREATE INDEX "WorkspaceSubscription_asaasCheckoutExpiresAt_idx"
ON "WorkspaceSubscription"("asaasCheckoutExpiresAt");

CREATE INDEX "PaymentCharge_subscriptionId_status_idx"
ON "PaymentCharge"("subscriptionId", "status");

CREATE INDEX "PlatformFiscalSettings_enabled_validatedAt_idx"
ON "PlatformFiscalSettings"("enabled", "validatedAt");

CREATE INDEX "PlatformFiscalSettings_validatedByUserId_idx"
ON "PlatformFiscalSettings"("validatedByUserId");

CREATE UNIQUE INDEX "BillingInvoice_provider_providerInvoiceId_key"
ON "BillingInvoice"("provider", "providerInvoiceId");

CREATE UNIQUE INDEX "BillingInvoice_provider_providerPaymentId_key"
ON "BillingInvoice"("provider", "providerPaymentId");

CREATE INDEX "BillingInvoice_workspaceId_createdAt_idx"
ON "BillingInvoice"("workspaceId", "createdAt");

CREATE INDEX "BillingInvoice_subscriptionId_createdAt_idx"
ON "BillingInvoice"("subscriptionId", "createdAt");

CREATE INDEX "BillingInvoice_paymentChargeId_idx"
ON "BillingInvoice"("paymentChargeId");

CREATE INDEX "BillingInvoice_providerPaymentId_idx"
ON "BillingInvoice"("providerPaymentId");

CREATE INDEX "BillingInvoice_status_updatedAt_idx"
ON "BillingInvoice"("status", "updatedAt");

ALTER TABLE "PlatformFiscalSettings"
ADD CONSTRAINT "PlatformFiscalSettings_validatedByUserId_fkey"
FOREIGN KEY ("validatedByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PaymentCharge"
ADD CONSTRAINT "PaymentCharge_subscriptionId_fkey"
FOREIGN KEY ("subscriptionId") REFERENCES "WorkspaceSubscription"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BillingInvoice"
ADD CONSTRAINT "BillingInvoice_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BillingInvoice"
ADD CONSTRAINT "BillingInvoice_subscriptionId_fkey"
FOREIGN KEY ("workspaceId", "subscriptionId")
REFERENCES "WorkspaceSubscription"("workspaceId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BillingInvoice"
ADD CONSTRAINT "BillingInvoice_paymentChargeId_fkey"
FOREIGN KEY ("paymentChargeId") REFERENCES "PaymentCharge"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
