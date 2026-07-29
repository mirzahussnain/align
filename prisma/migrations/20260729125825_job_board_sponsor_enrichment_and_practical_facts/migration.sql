-- CreateEnum
CREATE TYPE "WorkPatternPreference" AS ENUM ('REMOTE_ONLY', 'HYBRID', 'ONSITE', 'FLEXIBLE');

-- CreateEnum
CREATE TYPE "DbsCheckLevel" AS ENUM ('NONE', 'BASIC', 'STANDARD', 'ENHANCED');

-- CreateEnum
CREATE TYPE "SecurityClearanceLevel" AS ENUM ('NONE', 'BPSS', 'CTC', 'SC', 'DV');

-- CreateEnum
CREATE TYPE "CompanyLinkStatus" AS ENUM ('NOT_ATTEMPTED', 'MATCHED_COMPANY', 'AMBIGUOUS_COMPANY', 'NO_COMPANY_MATCH');

-- AlterTable
ALTER TABLE "job_snapshot" ADD COLUMN     "companyLinkEvidence" JSONB,
ADD COLUMN     "companyLinkStatus" "CompanyLinkStatus" NOT NULL DEFAULT 'NOT_ATTEMPTED',
ADD COLUMN     "companyLinkedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "profile_practical_facts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "requiresSponsorshipNow" BOOLEAN,
    "mayRequireSponsorshipLater" BOOLEAN,
    "openToRelocation" BOOLEAN,
    "relocationLocations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "maxCommuteMinutes" INTEGER,
    "workPatternPreference" "WorkPatternPreference",
    "maxOnsiteDaysPerWeek" INTEGER,
    "drivingLicenceHeld" BOOLEAN,
    "ownVehicleAvailable" BOOLEAN,
    "willingToTravel" BOOLEAN,
    "dbsCheckLevel" "DbsCheckLevel",
    "dbsUpdateService" BOOLEAN,
    "securityClearance" "SecurityClearanceLevel",
    "ukResidencyStartDate" TIMESTAMP(3),
    "availableForNightShifts" BOOLEAN,
    "availableForWeekendShifts" BOOLEAN,
    "availableForRotatingShifts" BOOLEAN,
    "earliestStartDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profile_practical_facts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "profile_practical_facts_userId_key" ON "profile_practical_facts"("userId");

-- CreateIndex
CREATE INDEX "company_record_sponsorRegisterVersion_idx" ON "company_record"("sponsorRegisterVersion");

-- CreateIndex
CREATE INDEX "job_snapshot_companyLinkStatus_normalisedEmployerName_idx" ON "job_snapshot"("companyLinkStatus", "normalisedEmployerName");

-- AddForeignKey
ALTER TABLE "profile_practical_facts" ADD CONSTRAINT "profile_practical_facts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
