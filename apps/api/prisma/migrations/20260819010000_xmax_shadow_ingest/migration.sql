-- CreateEnum
CREATE TYPE "XmaxAccountStatus" AS ENUM ('active', 'paused', 'disabled');

-- CreateEnum
CREATE TYPE "XmaxShadowEventStatus" AS ENUM ('observed', 'discarded', 'duplicate', 'failed');

-- CreateTable
CREATE TABLE "XmaxAccount" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "queueId" TEXT NOT NULL,
    "apiKeyEncrypted" TEXT NOT NULL,
    "apiKeyIv" TEXT NOT NULL,
    "apiKeyTag" TEXT NOT NULL,
    "webhookSecretHash" TEXT NOT NULL,
    "defaultCountryCode" TEXT NOT NULL DEFAULT '55',
    "qualifiedLeadTagIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "purchaseTagIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "XmaxAccountStatus" NOT NULL DEFAULT 'active',
    "shadowMode" BOOLEAN NOT NULL DEFAULT true,
    "capiSendEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lastWebhookAt" TIMESTAMP(3),
    "lastSuccessfulGetContact" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "XmaxAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "XmaxContactEventDedup" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "XmaxContactEventDedup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "XmaxShadowEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "contactId" TEXT,
    "eventName" TEXT,
    "phoneNormalized" TEXT,
    "phoneHash" TEXT,
    "status" "XmaxShadowEventStatus" NOT NULL,
    "reasonCode" TEXT,
    "ingressKey" TEXT NOT NULL,
    "providerAttempt" INTEGER,
    "tagIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rawSummary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "XmaxShadowEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "XmaxAccount_workspaceId_status_idx" ON "XmaxAccount"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "XmaxAccount_workspaceId_createdAt_idx" ON "XmaxAccount"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "XmaxContactEventDedup_accountId_firstSeenAt_idx" ON "XmaxContactEventDedup"("accountId", "firstSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "XmaxContactEventDedup_accountId_contactId_eventName_key" ON "XmaxContactEventDedup"("accountId", "contactId", "eventName");

-- CreateIndex
CREATE INDEX "XmaxShadowEvent_workspaceId_createdAt_idx" ON "XmaxShadowEvent"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "XmaxShadowEvent_accountId_status_createdAt_idx" ON "XmaxShadowEvent"("accountId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "XmaxShadowEvent_accountId_contactId_eventName_idx" ON "XmaxShadowEvent"("accountId", "contactId", "eventName");

-- CreateIndex
CREATE UNIQUE INDEX "XmaxShadowEvent_accountId_ingressKey_key" ON "XmaxShadowEvent"("accountId", "ingressKey");

-- AddForeignKey
ALTER TABLE "XmaxAccount" ADD CONSTRAINT "XmaxAccount_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "XmaxContactEventDedup" ADD CONSTRAINT "XmaxContactEventDedup_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "XmaxAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "XmaxShadowEvent" ADD CONSTRAINT "XmaxShadowEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "XmaxShadowEvent" ADD CONSTRAINT "XmaxShadowEvent_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "XmaxAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
