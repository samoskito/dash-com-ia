-- Add multi-recipient ops-alert phone support while retaining the legacy first-phone column.
ALTER TABLE "WorkspaceOpsAlertSettings"
ADD COLUMN "alertPhonesE164" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "WorkspaceOpsAlertSettings"
SET "alertPhonesE164" = ARRAY["alertPhoneE164"]
WHERE "alertPhoneE164" IS NOT NULL
  AND "alertPhoneE164" <> '';
