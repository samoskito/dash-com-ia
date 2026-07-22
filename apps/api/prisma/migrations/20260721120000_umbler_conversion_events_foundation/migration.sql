-- Establish an isolated foundation for provider-driven conversion events.
-- Existing message observation and LeadSubmitted production remain unchanged.

ALTER TYPE "ConversionTriggerType"
ADD VALUE IF NOT EXISTS 'provider_automation';

ALTER TYPE "ConversionTriggerType"
ADD VALUE IF NOT EXISTS 'structured_catalog';

CREATE TYPE "ProviderConversionRuleMode" AS ENUM (
  'observation',
  'production'
);

CREATE TYPE "ProviderConversionExecutionStatus" AS ENUM (
  'observed',
  'eligible',
  'materialized',
  'duplicate',
  'blocked',
  'failed'
);

CREATE TYPE "InboundWebhookDeliveryPurpose" AS ENUM (
  'message_observation',
  'conversion_automation'
);

CREATE UNIQUE INDEX "ConversionRule_workspaceId_id_key"
ON "ConversionRule"("workspaceId", "id");

ALTER TABLE "InboundWebhookDelivery"
ADD COLUMN "purpose" "InboundWebhookDeliveryPurpose" NOT NULL DEFAULT 'message_observation',
ADD COLUMN "providerRuleEndpointWorkspaceId" TEXT,
ADD COLUMN "providerRuleEndpointId" TEXT;

CREATE TABLE "ProviderConversionRuleConfig" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "conversionRuleId" TEXT NOT NULL,
  "connectionId" TEXT NOT NULL,
  "parserReleaseId" TEXT NOT NULL,
  "mode" "ProviderConversionRuleMode" NOT NULL DEFAULT 'observation',
  "productionActivatedAt" TIMESTAMP(3),
  "removedAt" TIMESTAMP(3),
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProviderConversionRuleConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProviderConversionRuleChannel" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "providerRuleId" TEXT NOT NULL,
  "channelId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProviderConversionRuleChannel_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProviderConversionRuleEndpoint" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "providerRuleId" TEXT NOT NULL,
  "secretHash" TEXT NOT NULL,
  "secretVersion" INTEGER NOT NULL DEFAULT 1,
  "lastDeliveryAt" TIMESTAMP(3),
  "lastSuccessfulParseAt" TIMESTAMP(3),
  "rotatedAt" TIMESTAMP(3),
  "removedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProviderConversionRuleEndpoint_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProviderConversionRuleEndpoint_secretVersion_check"
    CHECK ("secretVersion" > 0)
);

CREATE TABLE "ConversionCatalog" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "providerRuleId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "productName" TEXT NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'BRL',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ConversionCatalog_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConversionCatalog_currency_check"
    CHECK ("currency" ~ '^[A-Z]{3}$')
);

CREATE TABLE "ConversionCatalogAttribute" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "catalogId" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "key" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ConversionCatalogAttribute_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConversionCatalogAttribute_position_check"
    CHECK ("position" BETWEEN 1 AND 2)
);

CREATE TABLE "ConversionCatalogVariant" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "catalogId" TEXT NOT NULL,
  "normalizedKey" TEXT NOT NULL,
  "attributeValues" JSONB NOT NULL,
  "aliases" JSONB,
  "valueCents" INTEGER NOT NULL,
  "contentName" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ConversionCatalogVariant_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConversionCatalogVariant_valueCents_check"
    CHECK ("valueCents" > 0)
);

CREATE TABLE "ProviderConversionRuleExecution" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "providerRuleId" TEXT NOT NULL,
  "sourceDeliveryId" TEXT NOT NULL,
  "channelWorkspaceId" TEXT,
  "channelId" TEXT,
  "matchedCatalogVariantWorkspaceId" TEXT,
  "matchedCatalogVariantId" TEXT,
  "externalExecutionKey" TEXT NOT NULL,
  "occurredAt" TIMESTAMP(3) NOT NULL,
  "contactIdentityHash" TEXT,
  "status" "ProviderConversionExecutionStatus" NOT NULL DEFAULT 'observed',
  "reasonCode" TEXT,
  "normalizedResult" JSONB,
  "valueCents" INTEGER,
  "currency" TEXT,
  "leadId" TEXT,
  "conversionEventLogId" TEXT,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "lastAttemptedAt" TIMESTAMP(3),
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProviderConversionRuleExecution_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProviderConversionRuleExecution_channel_pair_check"
    CHECK (("channelWorkspaceId" IS NULL) = ("channelId" IS NULL)),
  CONSTRAINT "ProviderConversionRuleExecution_channel_workspace_check"
    CHECK ("channelWorkspaceId" IS NULL OR "channelWorkspaceId" = "workspaceId"),
  CONSTRAINT "ProviderConversionRuleExecution_variant_pair_check"
    CHECK (
      ("matchedCatalogVariantWorkspaceId" IS NULL) =
      ("matchedCatalogVariantId" IS NULL)
    ),
  CONSTRAINT "ProviderConversionRuleExecution_variant_workspace_check"
    CHECK (
      "matchedCatalogVariantWorkspaceId" IS NULL OR
      "matchedCatalogVariantWorkspaceId" = "workspaceId"
    ),
  CONSTRAINT "ProviderConversionRuleExecution_attemptCount_check"
    CHECK ("attemptCount" >= 0),
  CONSTRAINT "ProviderConversionRuleExecution_value_check"
    CHECK ("valueCents" IS NULL OR "valueCents" > 0),
  CONSTRAINT "ProviderConversionRuleExecution_currency_check"
    CHECK ("currency" IS NULL OR "currency" ~ '^[A-Z]{3}$')
);

CREATE UNIQUE INDEX "ProviderConversionRuleConfig_workspaceId_id_key"
ON "ProviderConversionRuleConfig"("workspaceId", "id");

CREATE UNIQUE INDEX "ProviderConversionRuleConfig_workspaceId_conversionRuleId_key"
ON "ProviderConversionRuleConfig"("workspaceId", "conversionRuleId");

CREATE INDEX "ProviderConversionRuleConfig_workspaceId_connectionId_mode_idx"
ON "ProviderConversionRuleConfig"("workspaceId", "connectionId", "mode");

CREATE INDEX "ProviderConversionRuleConfig_workspaceId_removedAt_idx"
ON "ProviderConversionRuleConfig"("workspaceId", "removedAt");

CREATE INDEX "ProviderConversionRuleConfig_parserReleaseId_idx"
ON "ProviderConversionRuleConfig"("parserReleaseId");

CREATE INDEX "ProviderConversionRuleConfig_createdByUserId_idx"
ON "ProviderConversionRuleConfig"("createdByUserId");

CREATE UNIQUE INDEX "ProviderConversionRuleChannel_providerRuleId_channelId_key"
ON "ProviderConversionRuleChannel"("providerRuleId", "channelId");

CREATE INDEX "ProviderConversionRuleChannel_workspaceId_channelId_idx"
ON "ProviderConversionRuleChannel"("workspaceId", "channelId");

CREATE UNIQUE INDEX "ProviderConversionRuleEndpoint_workspaceId_id_key"
ON "ProviderConversionRuleEndpoint"("workspaceId", "id");

CREATE UNIQUE INDEX "ProviderConversionRuleEndpoint_workspaceId_providerRuleId_key"
ON "ProviderConversionRuleEndpoint"("workspaceId", "providerRuleId");

CREATE INDEX "ProviderConversionRuleEndpoint_workspaceId_removedAt_idx"
ON "ProviderConversionRuleEndpoint"("workspaceId", "removedAt");

CREATE UNIQUE INDEX "ConversionCatalog_workspaceId_id_key"
ON "ConversionCatalog"("workspaceId", "id");

CREATE UNIQUE INDEX "ConversionCatalog_workspaceId_providerRuleId_key"
ON "ConversionCatalog"("workspaceId", "providerRuleId");

CREATE INDEX "ConversionCatalog_workspaceId_active_idx"
ON "ConversionCatalog"("workspaceId", "active");

CREATE UNIQUE INDEX "ConversionCatalogAttribute_catalogId_position_key"
ON "ConversionCatalogAttribute"("catalogId", "position");

CREATE UNIQUE INDEX "ConversionCatalogAttribute_catalogId_key_key"
ON "ConversionCatalogAttribute"("catalogId", "key");

CREATE INDEX "ConversionCatalogAttribute_workspaceId_catalogId_idx"
ON "ConversionCatalogAttribute"("workspaceId", "catalogId");

CREATE UNIQUE INDEX "ConversionCatalogVariant_workspaceId_id_key"
ON "ConversionCatalogVariant"("workspaceId", "id");

CREATE UNIQUE INDEX "ConversionCatalogVariant_catalogId_normalizedKey_key"
ON "ConversionCatalogVariant"("catalogId", "normalizedKey");

CREATE INDEX "ConversionCatalogVariant_workspaceId_catalogId_active_idx"
ON "ConversionCatalogVariant"("workspaceId", "catalogId", "active");

CREATE UNIQUE INDEX "ProviderConversionRuleExecution_providerRuleId_externalExecutionKey_key"
ON "ProviderConversionRuleExecution"("providerRuleId", "externalExecutionKey");

CREATE INDEX "ProviderConversionRuleExecution_workspaceId_status_occurredAt_idx"
ON "ProviderConversionRuleExecution"("workspaceId", "status", "occurredAt");

CREATE INDEX "ProviderConversionRuleExecution_workspaceId_contactIdentityHash_occurredAt_idx"
ON "ProviderConversionRuleExecution"("workspaceId", "contactIdentityHash", "occurredAt");

CREATE INDEX "ProviderConversionRuleExecution_sourceDeliveryId_idx"
ON "ProviderConversionRuleExecution"("sourceDeliveryId");

CREATE INDEX "ProviderConversionRuleExecution_channelId_idx"
ON "ProviderConversionRuleExecution"("channelId");

CREATE INDEX "ProviderConversionRuleExecution_matchedCatalogVariantId_idx"
ON "ProviderConversionRuleExecution"("matchedCatalogVariantId");

CREATE INDEX "ProviderConversionRuleExecution_leadId_idx"
ON "ProviderConversionRuleExecution"("leadId");

CREATE INDEX "ProviderConversionRuleExecution_conversionEventLogId_idx"
ON "ProviderConversionRuleExecution"("conversionEventLogId");

CREATE INDEX "InboundWebhookDelivery_workspaceId_purpose_createdAt_idx"
ON "InboundWebhookDelivery"("workspaceId", "purpose", "createdAt");

CREATE INDEX "InboundWebhookDelivery_providerRuleEndpointId_idx"
ON "InboundWebhookDelivery"("providerRuleEndpointId");

ALTER TABLE "ProviderConversionRuleConfig"
ADD CONSTRAINT "ProviderConversionRuleConfig_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProviderConversionRuleConfig"
ADD CONSTRAINT "ProviderConversionRuleConfig_conversionRuleId_fkey"
FOREIGN KEY ("workspaceId", "conversionRuleId")
REFERENCES "ConversionRule"("workspaceId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProviderConversionRuleConfig"
ADD CONSTRAINT "ProviderConversionRuleConfig_connectionId_fkey"
FOREIGN KEY ("workspaceId", "connectionId")
REFERENCES "InboundWebhookConnection"("workspaceId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProviderConversionRuleConfig"
ADD CONSTRAINT "ProviderConversionRuleConfig_parserReleaseId_fkey"
FOREIGN KEY ("parserReleaseId") REFERENCES "InboundWebhookParserRelease"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProviderConversionRuleConfig"
ADD CONSTRAINT "ProviderConversionRuleConfig_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProviderConversionRuleChannel"
ADD CONSTRAINT "ProviderConversionRuleChannel_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProviderConversionRuleChannel"
ADD CONSTRAINT "ProviderConversionRuleChannel_providerRuleId_fkey"
FOREIGN KEY ("workspaceId", "providerRuleId")
REFERENCES "ProviderConversionRuleConfig"("workspaceId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProviderConversionRuleChannel"
ADD CONSTRAINT "ProviderConversionRuleChannel_channelId_fkey"
FOREIGN KEY ("workspaceId", "channelId")
REFERENCES "InboundWebhookChannel"("workspaceId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProviderConversionRuleEndpoint"
ADD CONSTRAINT "ProviderConversionRuleEndpoint_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProviderConversionRuleEndpoint"
ADD CONSTRAINT "ProviderConversionRuleEndpoint_providerRuleId_fkey"
FOREIGN KEY ("workspaceId", "providerRuleId")
REFERENCES "ProviderConversionRuleConfig"("workspaceId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ConversionCatalog"
ADD CONSTRAINT "ConversionCatalog_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ConversionCatalog"
ADD CONSTRAINT "ConversionCatalog_providerRuleId_fkey"
FOREIGN KEY ("workspaceId", "providerRuleId")
REFERENCES "ProviderConversionRuleConfig"("workspaceId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ConversionCatalogAttribute"
ADD CONSTRAINT "ConversionCatalogAttribute_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ConversionCatalogAttribute"
ADD CONSTRAINT "ConversionCatalogAttribute_catalogId_fkey"
FOREIGN KEY ("workspaceId", "catalogId")
REFERENCES "ConversionCatalog"("workspaceId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ConversionCatalogVariant"
ADD CONSTRAINT "ConversionCatalogVariant_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ConversionCatalogVariant"
ADD CONSTRAINT "ConversionCatalogVariant_catalogId_fkey"
FOREIGN KEY ("workspaceId", "catalogId")
REFERENCES "ConversionCatalog"("workspaceId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProviderConversionRuleExecution"
ADD CONSTRAINT "ProviderConversionRuleExecution_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProviderConversionRuleExecution"
ADD CONSTRAINT "ProviderConversionRuleExecution_providerRuleId_fkey"
FOREIGN KEY ("workspaceId", "providerRuleId")
REFERENCES "ProviderConversionRuleConfig"("workspaceId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProviderConversionRuleExecution"
ADD CONSTRAINT "ProviderConversionRuleExecution_sourceDeliveryId_fkey"
FOREIGN KEY ("workspaceId", "sourceDeliveryId")
REFERENCES "InboundWebhookDelivery"("workspaceId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ProviderConversionRuleExecution"
ADD CONSTRAINT "ProviderConversionRuleExecution_channelId_fkey"
FOREIGN KEY ("channelWorkspaceId", "channelId")
REFERENCES "InboundWebhookChannel"("workspaceId", "id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ProviderConversionRuleExecution"
ADD CONSTRAINT "ProviderConversionRuleExecution_catalogVariantId_fkey"
FOREIGN KEY (
  "matchedCatalogVariantWorkspaceId",
  "matchedCatalogVariantId"
)
REFERENCES "ConversionCatalogVariant"("workspaceId", "id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InboundWebhookDelivery"
ADD CONSTRAINT "InboundWebhookDelivery_providerRuleEndpoint_pair_check"
CHECK (
  ("providerRuleEndpointWorkspaceId" IS NULL) =
  ("providerRuleEndpointId" IS NULL)
),
ADD CONSTRAINT "InboundWebhookDelivery_providerRuleEndpoint_workspace_check"
CHECK (
  "providerRuleEndpointWorkspaceId" IS NULL OR
  "providerRuleEndpointWorkspaceId" = "workspaceId"
);

ALTER TABLE "InboundWebhookDelivery"
ADD CONSTRAINT "InboundWebhookDelivery_providerRuleEndpointId_fkey"
FOREIGN KEY (
  "providerRuleEndpointWorkspaceId",
  "providerRuleEndpointId"
)
REFERENCES "ProviderConversionRuleEndpoint"("workspaceId", "id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- This parser is observation-only until real Umbler automation payloads are
-- captured as fixtures and the parser is certified by a platform owner.
INSERT INTO "InboundWebhookParserRelease" (
  "id",
  "provider",
  "version",
  "status",
  "createdAt",
  "updatedAt"
)
VALUES (
  'inbound_parser_umbler_automation_v1',
  'umbler',
  'automation-v1',
  'observation_only',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("provider", "version") DO NOTHING;
