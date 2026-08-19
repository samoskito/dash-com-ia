-- CreateTable
CREATE TABLE "LicenseDeliveryArtifact" (
    "id" TEXT NOT NULL,
    "licenseId" TEXT NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "authTag" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LicenseDeliveryArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LicenseDeliveryArtifact_licenseId_key" ON "LicenseDeliveryArtifact"("licenseId");

-- CreateIndex
CREATE INDEX "LicenseDeliveryArtifact_expiresAt_idx" ON "LicenseDeliveryArtifact"("expiresAt");

-- AddForeignKey
ALTER TABLE "LicenseDeliveryArtifact" ADD CONSTRAINT "LicenseDeliveryArtifact_licenseId_fkey" FOREIGN KEY ("licenseId") REFERENCES "License"("id") ON DELETE CASCADE ON UPDATE CASCADE;
