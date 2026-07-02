-- CreateEnum
CREATE TYPE "DiagnosticSource" AS ENUM ('meta', 'uazapi', 'asaas', 'internal');

-- CreateEnum
CREATE TYPE "DiagnosticSeverity" AS ENUM ('info', 'warning', 'error', 'critical');

-- CreateTable
CREATE TABLE "WebhookLog" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT,
    "source" "DiagnosticSource" NOT NULL,
    "eventType" TEXT NOT NULL,
    "externalEventId" TEXT,
    "status" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "leadId" TEXT,
    "phoneHash" TEXT,
    "campaignId" TEXT,
    "adSetId" TEXT,
    "adId" TEXT,
    "jobId" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "summaryPayload" JSONB,
    "rawPayloadRef" TEXT,
    "idempotencyKey" TEXT,

    CONSTRAINT "WebhookLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationLog" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT,
    "source" "DiagnosticSource" NOT NULL,
    "operation" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "requestSummary" JSONB,
    "responseSummary" JSONB,
    "httpStatus" INTEGER,
    "providerRequestId" TEXT,
    "providerErrorCode" TEXT,
    "providerErrorMessage" TEXT,
    "leadId" TEXT,
    "campaignId" TEXT,
    "adSetId" TEXT,
    "adId" TEXT,
    "jobId" TEXT,

    CONSTRAINT "IntegrationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversionEventLog" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT,
    "leadId" TEXT,
    "phoneHash" TEXT,
    "sourceTrigger" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "pixelId" TEXT,
    "metaAccountId" TEXT,
    "campaignId" TEXT,
    "adSetId" TEXT,
    "adId" TEXT,
    "attributionStatus" TEXT,
    "dedupeKey" TEXT,
    "sentAt" TIMESTAMP(3),
    "providerResponseSummary" JSONB,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "jobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversionEventLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobAttempt" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT,
    "queueName" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "jobName" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "nextRetryAt" TIMESTAMP(3),
    "source" "DiagnosticSource" NOT NULL,
    "relatedEntityType" TEXT,
    "relatedEntityId" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "summaryPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiagnosticEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT,
    "source" "DiagnosticSource" NOT NULL,
    "eventType" TEXT NOT NULL,
    "severity" "DiagnosticSeverity" NOT NULL,
    "status" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "leadId" TEXT,
    "phoneHash" TEXT,
    "campaignId" TEXT,
    "adSetId" TEXT,
    "adId" TEXT,
    "jobId" TEXT,
    "errorCode" TEXT,
    "summaryPayload" JSONB,
    "webhookLogId" TEXT,
    "integrationLogId" TEXT,
    "conversionEventLogId" TEXT,
    "jobAttemptId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiagnosticEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT,
    "actorUserId" TEXT,
    "actorType" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "reason" TEXT,
    "sourceIp" TEXT,
    "resultStatus" TEXT NOT NULL,
    "beforeSummary" JSONB,
    "afterSummary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WebhookLog_workspaceId_source_status_receivedAt_idx" ON "WebhookLog"("workspaceId", "source", "status", "receivedAt");

-- CreateIndex
CREATE INDEX "WebhookLog_idempotencyKey_idx" ON "WebhookLog"("idempotencyKey");

-- CreateIndex
CREATE INDEX "IntegrationLog_workspaceId_source_status_startedAt_idx" ON "IntegrationLog"("workspaceId", "source", "status", "startedAt");

-- CreateIndex
CREATE INDEX "IntegrationLog_providerRequestId_idx" ON "IntegrationLog"("providerRequestId");

-- CreateIndex
CREATE INDEX "ConversionEventLog_workspaceId_status_createdAt_idx" ON "ConversionEventLog"("workspaceId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ConversionEventLog_dedupeKey_idx" ON "ConversionEventLog"("dedupeKey");

-- CreateIndex
CREATE INDEX "ConversionEventLog_leadId_idx" ON "ConversionEventLog"("leadId");

-- CreateIndex
CREATE INDEX "JobAttempt_workspaceId_source_status_createdAt_idx" ON "JobAttempt"("workspaceId", "source", "status", "createdAt");

-- CreateIndex
CREATE INDEX "JobAttempt_jobId_idx" ON "JobAttempt"("jobId");

-- CreateIndex
CREATE INDEX "DiagnosticEvent_workspaceId_source_status_occurredAt_idx" ON "DiagnosticEvent"("workspaceId", "source", "status", "occurredAt");

-- CreateIndex
CREATE INDEX "DiagnosticEvent_workspaceId_severity_occurredAt_idx" ON "DiagnosticEvent"("workspaceId", "severity", "occurredAt");

-- CreateIndex
CREATE INDEX "DiagnosticEvent_eventType_idx" ON "DiagnosticEvent"("eventType");

-- CreateIndex
CREATE INDEX "DiagnosticEvent_leadId_idx" ON "DiagnosticEvent"("leadId");

-- CreateIndex
CREATE INDEX "DiagnosticEvent_phoneHash_idx" ON "DiagnosticEvent"("phoneHash");

-- CreateIndex
CREATE INDEX "DiagnosticEvent_campaignId_idx" ON "DiagnosticEvent"("campaignId");

-- CreateIndex
CREATE INDEX "DiagnosticEvent_adSetId_idx" ON "DiagnosticEvent"("adSetId");

-- CreateIndex
CREATE INDEX "DiagnosticEvent_adId_idx" ON "DiagnosticEvent"("adId");

-- CreateIndex
CREATE INDEX "DiagnosticEvent_jobId_idx" ON "DiagnosticEvent"("jobId");

-- CreateIndex
CREATE INDEX "AuditLog_workspaceId_createdAt_idx" ON "AuditLog"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorUserId_idx" ON "AuditLog"("actorUserId");

-- CreateIndex
CREATE INDEX "AuditLog_targetType_targetId_idx" ON "AuditLog"("targetType", "targetId");

-- AddForeignKey
ALTER TABLE "WebhookLog" ADD CONSTRAINT "WebhookLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationLog" ADD CONSTRAINT "IntegrationLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversionEventLog" ADD CONSTRAINT "ConversionEventLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobAttempt" ADD CONSTRAINT "JobAttempt_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticEvent" ADD CONSTRAINT "DiagnosticEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticEvent" ADD CONSTRAINT "DiagnosticEvent_webhookLogId_fkey" FOREIGN KEY ("webhookLogId") REFERENCES "WebhookLog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticEvent" ADD CONSTRAINT "DiagnosticEvent_integrationLogId_fkey" FOREIGN KEY ("integrationLogId") REFERENCES "IntegrationLog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticEvent" ADD CONSTRAINT "DiagnosticEvent_conversionEventLogId_fkey" FOREIGN KEY ("conversionEventLogId") REFERENCES "ConversionEventLog"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiagnosticEvent" ADD CONSTRAINT "DiagnosticEvent_jobAttemptId_fkey" FOREIGN KEY ("jobAttemptId") REFERENCES "JobAttempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
