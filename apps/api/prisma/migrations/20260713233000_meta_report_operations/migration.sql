-- Store the current budget owner and ad creative preview alongside Meta snapshots.
ALTER TABLE "MetaCampaign"
ADD COLUMN "dailyBudgetCents" INTEGER,
ADD COLUMN "lifetimeBudgetCents" INTEGER;

ALTER TABLE "MetaAdSet"
ADD COLUMN "dailyBudgetCents" INTEGER,
ADD COLUMN "lifetimeBudgetCents" INTEGER;

ALTER TABLE "MetaAd"
ADD COLUMN "thumbnailUrl" TEXT;
