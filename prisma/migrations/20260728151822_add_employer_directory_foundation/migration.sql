-- CreateEnum
CREATE TYPE "EmployerAtsProvider" AS ENUM ('GREENHOUSE', 'LEVER', 'SMARTRECRUITERS', 'ASHBY');

-- CreateEnum
CREATE TYPE "EmployerSourceOrigin" AS ENUM ('CURATED_SEED', 'MANUAL_ADMIN', 'VERIFIED_COMPANY_URL', 'USER_SUGGESTED_UNVERIFIED');

-- CreateEnum
CREATE TYPE "EmployerSourceVerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'FAILED', 'DISABLED');

-- CreateEnum
CREATE TYPE "EmployerSourceRegion" AS ENUM ('GLOBAL', 'EU');

-- CreateEnum
CREATE TYPE "SponsorMatchStatus" AS ENUM ('NOT_CHECKED', 'EXACT', 'LIKELY', 'AMBIGUOUS', 'NONE');

-- AlterTable
ALTER TABLE "job_snapshot" ADD COLUMN     "companyRecordId" TEXT;

-- CreateTable
CREATE TABLE "company_record" (
    "id" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "normalisedName" TEXT NOT NULL,
    "websiteUrl" TEXT,
    "careersUrl" TEXT,
    "country" TEXT,
    "industry" TEXT,
    "sponsorMatchStatus" "SponsorMatchStatus" NOT NULL DEFAULT 'NOT_CHECKED',
    "sponsorOrganisationName" TEXT,
    "sponsorRegisterVersion" TEXT,
    "sponsorCheckedAt" TIMESTAMP(3),
    "sponsorEvidence" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employer_job_source" (
    "id" TEXT NOT NULL,
    "companyRecordId" TEXT NOT NULL,
    "provider" "EmployerAtsProvider" NOT NULL,
    "providerIdentifier" TEXT NOT NULL,
    "providerRegion" "EmployerSourceRegion",
    "careersUrl" TEXT,
    "boardUrl" TEXT,
    "sourceOrigin" "EmployerSourceOrigin" NOT NULL,
    "verificationStatus" "EmployerSourceVerificationStatus" NOT NULL DEFAULT 'PENDING',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "lastAttemptedAt" TIMESTAMP(3),
    "lastVerifiedAt" TIMESTAMP(3),
    "lastSuccessfulSyncAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "lastErrorAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employer_job_source_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "company_record_sponsorMatchStatus_idx" ON "company_record"("sponsorMatchStatus");

-- CreateIndex
CREATE UNIQUE INDEX "company_record_normalisedName_key" ON "company_record"("normalisedName");

-- CreateIndex
CREATE INDEX "employer_job_source_companyRecordId_enabled_idx" ON "employer_job_source"("companyRecordId", "enabled");

-- CreateIndex
CREATE INDEX "employer_job_source_provider_verificationStatus_idx" ON "employer_job_source"("provider", "verificationStatus");

-- CreateIndex
CREATE UNIQUE INDEX "employer_job_source_provider_providerIdentifier_key" ON "employer_job_source"("provider", "providerIdentifier");

-- CreateIndex
CREATE INDEX "job_snapshot_companyRecordId_idx" ON "job_snapshot"("companyRecordId");

-- AddForeignKey
ALTER TABLE "job_snapshot" ADD CONSTRAINT "job_snapshot_companyRecordId_fkey" FOREIGN KEY ("companyRecordId") REFERENCES "company_record"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employer_job_source" ADD CONSTRAINT "employer_job_source_companyRecordId_fkey" FOREIGN KEY ("companyRecordId") REFERENCES "company_record"("id") ON DELETE CASCADE ON UPDATE CASCADE;
