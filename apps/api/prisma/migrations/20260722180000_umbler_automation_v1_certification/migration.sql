-- Certify the Umbler automation contract captured from a real callback.
-- Automation rules still require an explicit production activation per rule.

UPDATE "InboundWebhookParserRelease"
SET
  "status" = 'certified',
  "certifiedAt" = COALESCE("certifiedAt", CURRENT_TIMESTAMP),
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "provider" = 'umbler'
  AND "version" = 'automation-v1'
  AND "status" <> 'retired';

-- Automation callbacks do not expose the Umbler channel. Resolve it from the
-- latest message observed for the same workspace, connection and contact.
CREATE INDEX IF NOT EXISTS "InboundWebhookEvent_workspace_connection_contact_occurred_idx"
ON "InboundWebhookEvent"(
  "workspaceId",
  "connectionId",
  "contactIdentityHash",
  "occurredAt" DESC
);
