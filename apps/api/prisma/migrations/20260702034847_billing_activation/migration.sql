-- CreateEnum
CREATE TYPE "PaymentChargeStatus" AS ENUM ('pending', 'paid', 'failed', 'canceled', 'expired');

-- CreateEnum
CREATE TYPE "WhatsappInstanceActivationStatus" AS ENUM ('pending_payment', 'active', 'canceled', 'expired');

-- CreateTable
CREATE TABLE "SubscriptionPlan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "pricePerWhatsappInstanceCents" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceSubscription" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "planId" TEXT,
    "status" TEXT NOT NULL,
    "activeInstances" INTEGER NOT NULL DEFAULT 0,
    "asaasSubscriptionId" TEXT,
    "currentPeriodEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentCharge" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'asaas',
    "externalChargeId" TEXT,
    "status" "PaymentChargeStatus" NOT NULL DEFAULT 'pending',
    "amountCents" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "checkoutUrl" TEXT,
    "dueAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentCharge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SplitReceiver" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "email" TEXT,
    "percentageBps" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SplitReceiver_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SplitRule" (
    "id" TEXT NOT NULL,
    "receiverId" TEXT NOT NULL,
    "percentageBps" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SplitRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsappInstanceActivation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "whatsappInstanceId" TEXT NOT NULL,
    "paymentChargeId" TEXT NOT NULL,
    "status" "WhatsappInstanceActivationStatus" NOT NULL DEFAULT 'pending_payment',
    "amountCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activatedAt" TIMESTAMP(3),

    CONSTRAINT "WhatsappInstanceActivation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionPlan_slug_key" ON "SubscriptionPlan"("slug");

-- CreateIndex
CREATE INDEX "WorkspaceSubscription_workspaceId_status_idx" ON "WorkspaceSubscription"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "WorkspaceSubscription_asaasSubscriptionId_idx" ON "WorkspaceSubscription"("asaasSubscriptionId");

-- CreateIndex
CREATE INDEX "PaymentCharge_workspaceId_status_idx" ON "PaymentCharge"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "PaymentCharge_externalChargeId_idx" ON "PaymentCharge"("externalChargeId");

-- CreateIndex
CREATE INDEX "SplitRule_receiverId_active_idx" ON "SplitRule"("receiverId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "WhatsappInstanceActivation_paymentChargeId_key" ON "WhatsappInstanceActivation"("paymentChargeId");

-- CreateIndex
CREATE INDEX "WhatsappInstanceActivation_workspaceId_status_idx" ON "WhatsappInstanceActivation"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "WhatsappInstanceActivation_whatsappInstanceId_idx" ON "WhatsappInstanceActivation"("whatsappInstanceId");

-- AddForeignKey
ALTER TABLE "WorkspaceSubscription" ADD CONSTRAINT "WorkspaceSubscription_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceSubscription" ADD CONSTRAINT "WorkspaceSubscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentCharge" ADD CONSTRAINT "PaymentCharge_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SplitRule" ADD CONSTRAINT "SplitRule_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "SplitReceiver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsappInstanceActivation" ADD CONSTRAINT "WhatsappInstanceActivation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsappInstanceActivation" ADD CONSTRAINT "WhatsappInstanceActivation_whatsappInstanceId_fkey" FOREIGN KEY ("whatsappInstanceId") REFERENCES "WhatsappInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsappInstanceActivation" ADD CONSTRAINT "WhatsappInstanceActivation_paymentChargeId_fkey" FOREIGN KEY ("paymentChargeId") REFERENCES "PaymentCharge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
