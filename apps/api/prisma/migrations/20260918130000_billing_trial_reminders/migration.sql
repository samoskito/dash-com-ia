CREATE TABLE "BillingTrialReminderTemplate" (
  "id" TEXT NOT NULL,
  "moment" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "emailSubject" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BillingTrialReminderTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BillingTrialReminderTemplate_moment_key"
  ON "BillingTrialReminderTemplate"("moment");

CREATE TABLE "BillingTrialReminderDelivery" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "subscriptionId" TEXT NOT NULL,
  "moment" TEXT NOT NULL,
  "emailStatus" TEXT,
  "whatsappStatus" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BillingTrialReminderDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BillingTrialReminderDelivery_subscriptionId_moment_key"
  ON "BillingTrialReminderDelivery"("subscriptionId", "moment");
CREATE INDEX "BillingTrialReminderDelivery_workspaceId_createdAt_idx"
  ON "BillingTrialReminderDelivery"("workspaceId", "createdAt");

ALTER TABLE "BillingTrialReminderDelivery"
  ADD CONSTRAINT "BillingTrialReminderDelivery_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BillingTrialReminderDelivery"
  ADD CONSTRAINT "BillingTrialReminderDelivery_subscriptionId_fkey"
  FOREIGN KEY ("subscriptionId") REFERENCES "WorkspaceSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
