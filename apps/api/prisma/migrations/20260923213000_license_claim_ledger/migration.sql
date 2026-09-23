-- CreateTable
CREATE TABLE "LicenseClaim" (
    "id" TEXT NOT NULL,
    "emailNormalized" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "codeHash" TEXT,
    "codeExpiresAt" TIMESTAMP(3),
    "codeAttempts" INTEGER NOT NULL DEFAULT 0,
    "codeSentCount" INTEGER NOT NULL DEFAULT 0,
    "codeWindowStartedAt" TIMESTAMP(3),
    "lastCodeSentAt" TIMESTAMP(3),
    "sourceProduct" TEXT,
    "buyerName" TEXT,
    "phoneE164" TEXT,
    "licenseId" TEXT,
    "issuedAt" TIMESTAMP(3),
    "revealedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LicenseClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LicenseClaim_emailNormalized_key" ON "LicenseClaim"("emailNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "LicenseClaim_licenseId_key" ON "LicenseClaim"("licenseId");

-- CreateIndex
CREATE INDEX "LicenseClaim_status_updatedAt_idx" ON "LicenseClaim"("status", "updatedAt");

-- AddForeignKey
ALTER TABLE "LicenseClaim" ADD CONSTRAINT "LicenseClaim_licenseId_fkey" FOREIGN KEY ("licenseId") REFERENCES "License"("id") ON DELETE SET NULL ON UPDATE CASCADE;
