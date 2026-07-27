-- CreateEnum
CREATE TYPE "SubscriptionPlanKind" AS ENUM ('standard', 'custom', 'exempt', 'legacy_protected');

-- CreateEnum
CREATE TYPE "SubscriptionPlanVisibility" AS ENUM ('public', 'private');

-- CreateEnum
CREATE TYPE "WorkspaceSubscriptionContractStatus" AS ENUM ('draft', 'awaiting_payment', 'active', 'past_due', 'grace_period', 'cancel_at_period_end', 'suspended', 'canceled', 'exempt', 'legacy_protected');

-- CreateEnum
CREATE TYPE "SubscriptionPaymentMethod" AS ENUM ('unknown', 'credit_card', 'pix');

-- CreateEnum
CREATE TYPE "WorkspaceBillingProfileStatus" AS ENUM ('incomplete', 'valid', 'invalid');

-- CreateEnum
CREATE TYPE "WhatsappSeatStatus" AS ENUM ('reserved', 'active', 'suspended', 'released');

-- CreateEnum
CREATE TYPE "WhatsappSeatProvider" AS ENUM ('uazapi', 'cloud_api', 'umbler', 'gupshup');

-- CreateEnum
CREATE TYPE "BillingProviderEventStatus" AS ENUM ('received', 'processing', 'processed', 'ignored', 'failed');

-- CreateEnum
CREATE TYPE "BillingInvoiceStatus" AS ENUM ('not_configured', 'pending_configuration', 'scheduled', 'issued', 'authorized', 'canceled', 'failed', 'rejected');

-- Package billing is additive. Legacy price and status columns remain intact
-- and no existing subscription is promoted to a current contract here.

-- AlterTable
ALTER TABLE "SubscriptionPlan" ADD COLUMN     "includedWhatsappNumbers" INTEGER,
ADD COLUMN     "kind" "SubscriptionPlanKind" NOT NULL DEFAULT 'standard',
ADD COLUMN     "monthlyPriceCents" INTEGER,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "visibility" "SubscriptionPlanVisibility" NOT NULL DEFAULT 'private';

-- AlterTable
ALTER TABLE "WorkspaceSubscription" ADD COLUMN     "accessEndsAt" TIMESTAMP(3),
ADD COLUMN     "activatedAt" TIMESTAMP(3),
ADD COLUMN     "asaasCheckoutId" TEXT,
ADD COLUMN     "asaasCustomerId" TEXT,
ADD COLUMN     "assignedAt" TIMESTAMP(3),
ADD COLUMN     "assignedByUserId" TEXT,
ADD COLUMN     "assignmentReason" TEXT,
ADD COLUMN     "billingMethod" "SubscriptionPaymentMethod" NOT NULL DEFAULT 'unknown',
ADD COLUMN     "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "canceledAt" TIMESTAMP(3),
ADD COLUMN     "cancellationReason" TEXT,
ADD COLUMN     "cancellationRequestedAt" TIMESTAMP(3),
ADD COLUMN     "contractStatus" "WorkspaceSubscriptionContractStatus" NOT NULL DEFAULT 'draft',
ADD COLUMN     "currentPeriodStart" TIMESTAMP(3),
ADD COLUMN     "endedAt" TIMESTAMP(3),
ADD COLUMN     "fiscalLastErrorAt" TIMESTAMP(3),
ADD COLUMN     "fiscalLastErrorCode" TEXT,
ADD COLUMN     "fiscalStatus" "BillingInvoiceStatus" NOT NULL DEFAULT 'not_configured',
ADD COLUMN     "graceEndsAt" TIMESTAMP(3),
ADD COLUMN     "includedWhatsappNumbersSnapshot" INTEGER,
ADD COLUMN     "isCurrent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "monthlyPriceCentsSnapshot" INTEGER,
ADD COLUMN     "planNameSnapshot" TEXT,
ADD COLUMN     "planVersionSnapshot" INTEGER,
ADD COLUMN     "suspendedAt" TIMESTAMP(3);

ALTER TABLE "SubscriptionPlan"
ADD CONSTRAINT "SubscriptionPlan_monthlyPriceCents_check"
CHECK ("monthlyPriceCents" IS NULL OR "monthlyPriceCents" >= 0),
ADD CONSTRAINT "SubscriptionPlan_includedWhatsappNumbers_check"
CHECK ("includedWhatsappNumbers" IS NULL OR "includedWhatsappNumbers" > 0),
ADD CONSTRAINT "SubscriptionPlan_version_check"
CHECK ("version" > 0);

ALTER TABLE "WorkspaceSubscription"
ADD CONSTRAINT "WorkspaceSubscription_monthlyPriceSnapshot_check"
CHECK ("monthlyPriceCentsSnapshot" IS NULL OR "monthlyPriceCentsSnapshot" >= 0),
ADD CONSTRAINT "WorkspaceSubscription_includedNumbersSnapshot_check"
CHECK (
  "includedWhatsappNumbersSnapshot" IS NULL
  OR "includedWhatsappNumbersSnapshot" > 0
),
ADD CONSTRAINT "WorkspaceSubscription_planVersionSnapshot_check"
CHECK ("planVersionSnapshot" IS NULL OR "planVersionSnapshot" > 0);

-- CreateTable
CREATE TABLE "WorkspaceBillingProfile" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "payerType" TEXT NOT NULL,
    "payerName" TEXT NOT NULL,
    "taxId" TEXT NOT NULL,
    "billingEmail" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL,
    "addressLine" TEXT NOT NULL,
    "addressNumber" TEXT NOT NULL,
    "addressComplement" TEXT,
    "district" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "asaasCustomerId" TEXT,
    "status" "WorkspaceBillingProfileStatus" NOT NULL DEFAULT 'incomplete',
    "validatedAt" TIMESTAMP(3),
    "validationErrorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceBillingProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsappSeat" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "provider" "WhatsappSeatProvider" NOT NULL,
    "normalizedPhone" TEXT,
    "whatsappInstanceId" TEXT,
    "inboundWebhookChannelId" TEXT,
    "status" "WhatsappSeatStatus" NOT NULL DEFAULT 'reserved',
    "reservationExpiresAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "suspendedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "releaseReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsappSeat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingProviderEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT,
    "subscriptionId" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'asaas',
    "providerEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "resourceType" TEXT,
    "resourceId" TEXT,
    "externalReference" TEXT,
    "status" "BillingProviderEventStatus" NOT NULL DEFAULT 'received',
    "payloadRedacted" JSONB,
    "processingAttempts" INTEGER NOT NULL DEFAULT 0,
    "lastErrorCode" TEXT,
    "lastErrorMessage" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingProviderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingContractAudit" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "planId" TEXT,
    "actorUserId" TEXT,
    "actorType" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "beforeSnapshot" JSONB,
    "afterSnapshot" JSONB,
    "providerReferences" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingContractAudit_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "WorkspaceBillingProfile"
ADD CONSTRAINT "WorkspaceBillingProfile_payerType_check"
CHECK ("payerType" IN ('individual', 'company')),
ADD CONSTRAINT "WorkspaceBillingProfile_state_check"
CHECK (char_length("state") = 2);

ALTER TABLE "WhatsappSeat"
ADD CONSTRAINT "WhatsappSeat_exactly_one_target_check"
CHECK (
  (
    CASE WHEN "whatsappInstanceId" IS NULL THEN 0 ELSE 1 END
    + CASE WHEN "inboundWebhookChannelId" IS NULL THEN 0 ELSE 1 END
  ) = 1
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceBillingProfile_workspaceId_key" ON "WorkspaceBillingProfile"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceBillingProfile_asaasCustomerId_key" ON "WorkspaceBillingProfile"("asaasCustomerId");

-- CreateIndex
CREATE INDEX "WorkspaceBillingProfile_status_updatedAt_idx" ON "WorkspaceBillingProfile"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "WorkspaceBillingProfile_taxId_idx" ON "WorkspaceBillingProfile"("taxId");

-- CreateIndex
CREATE INDEX "WhatsappSeat_workspaceId_status_idx" ON "WhatsappSeat"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "WhatsappSeat_subscriptionId_status_idx" ON "WhatsappSeat"("subscriptionId", "status");

-- CreateIndex
CREATE INDEX "WhatsappSeat_normalizedPhone_idx" ON "WhatsappSeat"("normalizedPhone");

-- CreateIndex
CREATE INDEX "WhatsappSeat_reservationExpiresAt_status_idx" ON "WhatsappSeat"("reservationExpiresAt", "status");

-- CreateIndex
CREATE INDEX "BillingProviderEvent_workspaceId_receivedAt_idx" ON "BillingProviderEvent"("workspaceId", "receivedAt");

-- CreateIndex
CREATE INDEX "BillingProviderEvent_subscriptionId_receivedAt_idx" ON "BillingProviderEvent"("subscriptionId", "receivedAt");

-- CreateIndex
CREATE INDEX "BillingProviderEvent_provider_resourceType_resourceId_idx" ON "BillingProviderEvent"("provider", "resourceType", "resourceId");

-- CreateIndex
CREATE INDEX "BillingProviderEvent_status_receivedAt_idx" ON "BillingProviderEvent"("status", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "BillingProviderEvent_provider_providerEventId_key" ON "BillingProviderEvent"("provider", "providerEventId");

-- CreateIndex
CREATE INDEX "BillingContractAudit_workspaceId_createdAt_idx" ON "BillingContractAudit"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "BillingContractAudit_subscriptionId_createdAt_idx" ON "BillingContractAudit"("subscriptionId", "createdAt");

-- CreateIndex
CREATE INDEX "BillingContractAudit_planId_idx" ON "BillingContractAudit"("planId");

-- CreateIndex
CREATE INDEX "BillingContractAudit_actorUserId_idx" ON "BillingContractAudit"("actorUserId");

-- CreateIndex
CREATE INDEX "BillingContractAudit_action_createdAt_idx" ON "BillingContractAudit"("action", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsappInstance_workspaceId_id_key" ON "WhatsappInstance"("workspaceId", "id");

-- CreateIndex
CREATE INDEX "SubscriptionPlan_kind_visibility_active_idx" ON "SubscriptionPlan"("kind", "visibility", "active");

-- CreateIndex
CREATE INDEX "WorkspaceSubscription_workspaceId_isCurrent_contractStatus_idx" ON "WorkspaceSubscription"("workspaceId", "isCurrent", "contractStatus");

-- CreateIndex
CREATE INDEX "WorkspaceSubscription_asaasCheckoutId_idx" ON "WorkspaceSubscription"("asaasCheckoutId");

-- CreateIndex
CREATE INDEX "WorkspaceSubscription_graceEndsAt_idx" ON "WorkspaceSubscription"("graceEndsAt");

-- CreateIndex
CREATE INDEX "WorkspaceSubscription_accessEndsAt_idx" ON "WorkspaceSubscription"("accessEndsAt");

-- CreateIndex
CREATE INDEX "WorkspaceSubscription_fiscalStatus_fiscalLastErrorAt_idx" ON "WorkspaceSubscription"("fiscalStatus", "fiscalLastErrorAt");

-- CreateIndex
CREATE INDEX "WorkspaceSubscription_assignedByUserId_idx" ON "WorkspaceSubscription"("assignedByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceSubscription_workspaceId_id_key" ON "WorkspaceSubscription"("workspaceId", "id");

-- One current commercial contract per workspace. Existing rows remain outside
-- this invariant until the explicit legacy-protected backfill sets isCurrent.
CREATE UNIQUE INDEX "WorkspaceSubscription_workspaceId_current_key"
ON "WorkspaceSubscription"("workspaceId")
WHERE "isCurrent" = true;

-- Released seats remain as history; only one non-released entitlement may
-- point at a provider resource at a time.
CREATE UNIQUE INDEX "WhatsappSeat_whatsappInstanceId_current_key"
ON "WhatsappSeat"("whatsappInstanceId")
WHERE
  "whatsappInstanceId" IS NOT NULL
  AND "status" IN ('reserved', 'active', 'suspended');

CREATE UNIQUE INDEX "WhatsappSeat_inboundWebhookChannelId_current_key"
ON "WhatsappSeat"("inboundWebhookChannelId")
WHERE
  "inboundWebhookChannelId" IS NOT NULL
  AND "status" IN ('reserved', 'active', 'suspended');

-- AddForeignKey
ALTER TABLE "WorkspaceSubscription" ADD CONSTRAINT "WorkspaceSubscription_assignedByUserId_fkey" FOREIGN KEY ("assignedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceBillingProfile" ADD CONSTRAINT "WorkspaceBillingProfile_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsappSeat" ADD CONSTRAINT "WhatsappSeat_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsappSeat" ADD CONSTRAINT "WhatsappSeat_subscriptionId_fkey" FOREIGN KEY ("workspaceId", "subscriptionId") REFERENCES "WorkspaceSubscription"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsappSeat" ADD CONSTRAINT "WhatsappSeat_whatsappInstanceId_fkey" FOREIGN KEY ("workspaceId", "whatsappInstanceId") REFERENCES "WhatsappInstance"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsappSeat" ADD CONSTRAINT "WhatsappSeat_inboundWebhookChannelId_fkey" FOREIGN KEY ("workspaceId", "inboundWebhookChannelId") REFERENCES "InboundWebhookChannel"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingProviderEvent" ADD CONSTRAINT "BillingProviderEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingProviderEvent" ADD CONSTRAINT "BillingProviderEvent_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "WorkspaceSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingContractAudit" ADD CONSTRAINT "BillingContractAudit_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingContractAudit" ADD CONSTRAINT "BillingContractAudit_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "WorkspaceSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingContractAudit" ADD CONSTRAINT "BillingContractAudit_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingContractAudit" ADD CONSTRAINT "BillingContractAudit_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
