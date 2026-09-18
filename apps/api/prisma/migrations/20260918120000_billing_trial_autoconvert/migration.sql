ALTER TABLE "WorkspaceSubscription"
  ADD COLUMN "trialEndsAt" TIMESTAMP(3),
  ADD COLUMN "trialAutoconvertDisabled" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "WorkspaceSubscription_trialEndsAt_isCurrent_contractStatus_idx"
  ON "WorkspaceSubscription"("trialEndsAt", "isCurrent", "contractStatus");
