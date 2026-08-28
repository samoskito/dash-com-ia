-- F1 additive WhatsApp capacity. This is intentionally additive: it does not
-- change existing contracts, seats, Asaas subscriptions, or prices.
CREATE TABLE "WorkspaceSubscriptionItem" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "nameSnapshot" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "capacityPerUnit" INTEGER NOT NULL,
    "monthlyPriceCentsPerUnit" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending_payment',
    "idempotencyKey" TEXT,
    "paymentChargeId" TEXT,
    "providerSyncStatus" TEXT NOT NULL DEFAULT 'not_required',
    "providerSyncAttempts" INTEGER NOT NULL DEFAULT 0,
    "providerSyncLastError" TEXT,
    "addedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceSubscriptionItem_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "WorkspaceSubscriptionItem_quantity_check" CHECK ("quantity" > 0),
    CONSTRAINT "WorkspaceSubscriptionItem_capacity_check" CHECK ("capacityPerUnit" > 0),
    CONSTRAINT "WorkspaceSubscriptionItem_price_check" CHECK ("monthlyPriceCentsPerUnit" >= 0)
);

CREATE UNIQUE INDEX "WorkspaceSubscriptionItem_subscriptionId_idempotencyKey_key"
ON "WorkspaceSubscriptionItem"("subscriptionId", "idempotencyKey");
CREATE UNIQUE INDEX "WorkspaceSubscriptionItem_paymentChargeId_key"
ON "WorkspaceSubscriptionItem"("paymentChargeId");
CREATE INDEX "WorkspaceSubscriptionItem_workspaceId_subscriptionId_status_idx"
ON "WorkspaceSubscriptionItem"("workspaceId", "subscriptionId", "status");

ALTER TABLE "WorkspaceSubscriptionItem"
ADD CONSTRAINT "WorkspaceSubscriptionItem_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkspaceSubscriptionItem"
ADD CONSTRAINT "WorkspaceSubscriptionItem_subscriptionId_fkey"
FOREIGN KEY ("workspaceId", "subscriptionId") REFERENCES "WorkspaceSubscription"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkspaceSubscriptionItem"
ADD CONSTRAINT "WorkspaceSubscriptionItem_addedByUserId_fkey"
FOREIGN KEY ("addedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkspaceSubscriptionItem"
ADD CONSTRAINT "WorkspaceSubscriptionItem_paymentChargeId_fkey"
FOREIGN KEY ("paymentChargeId") REFERENCES "PaymentCharge"("id") ON DELETE SET NULL ON UPDATE CASCADE;
