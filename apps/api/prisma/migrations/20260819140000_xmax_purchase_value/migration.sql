-- AlterTable
ALTER TABLE "XmaxAccount"
ADD COLUMN "purchaseValueCents" INTEGER,
ADD COLUMN "purchaseCurrency" TEXT NOT NULL DEFAULT 'BRL';
