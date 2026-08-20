-- CreateTable
CREATE TABLE "XmaxIngress" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "webhookSecretHash" TEXT NOT NULL,
    "status" "XmaxAccountStatus" NOT NULL DEFAULT 'active',
    "lastWebhookAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "XmaxIngress_pkey" PRIMARY KEY ("id")
);

-- AlterTable (additive, nullable — existing rows stay valid)
ALTER TABLE "XmaxAccount" ADD COLUMN "queueName" TEXT;
ALTER TABLE "XmaxAccount" ADD COLUMN "ingressId" TEXT;

-- CreateIndex
CREATE INDEX "XmaxIngress_status_idx" ON "XmaxIngress"("status");

-- CreateIndex
-- Postgres treats NULL as distinct in a unique index, so accounts without an
-- ingress (e.g. Bento before it is linked) never collide with one another.
CREATE UNIQUE INDEX "XmaxAccount_ingressId_queueId_key" ON "XmaxAccount"("ingressId", "queueId");

-- CreateIndex
CREATE INDEX "XmaxAccount_ingressId_status_idx" ON "XmaxAccount"("ingressId", "status");

-- AddForeignKey
ALTER TABLE "XmaxAccount" ADD CONSTRAINT "XmaxAccount_ingressId_fkey" FOREIGN KEY ("ingressId") REFERENCES "XmaxIngress"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
