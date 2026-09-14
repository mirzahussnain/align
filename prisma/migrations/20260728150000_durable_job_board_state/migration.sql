-- CreateEnum
CREATE TYPE "JobProvider" AS ENUM ('ADZUNA', 'REED', 'JOOBLE', 'GREENHOUSE', 'LEVER', 'SMARTRECRUITERS', 'ASHBY');

-- CreateEnum
CREATE TYPE "JobDescriptionAvailability" AS ENUM ('FULL', 'PARTIAL', 'EXTERNAL_ONLY');

-- CreateEnum
CREATE TYPE "JobDescriptionSource" AS ENUM ('PROVIDER_FULL', 'PROVIDER_PARTIAL', 'USER_PASTED');

-- CreateEnum
CREATE TYPE "JobSnapshotStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REMOVED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "SavedJobApplicationStatus" AS ENUM ('SAVED', 'APPLIED', 'INTERVIEWING', 'OFFERED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "JobMatchRequestStatus" AS ENUM ('PREPARED', 'CONSUMED', 'COMPLETED', 'EXPIRED');

-- DropIndex
DROP INDEX "saved_job_userId_canonicalIdentity_key";

-- AlterTable
ALTER TABLE "saved_job" DROP COLUMN "availabilityStatus",
DROP COLUMN "canonicalIdentity",
DROP COLUMN "canonicalUrl",
DROP COLUMN "company",
DROP COLUMN "jobSnapshot",
DROP COLUMN "lastCheckedAt",
DROP COLUMN "locationText",
DROP COLUMN "primaryProvider",
DROP COLUMN "removedAt",
DROP COLUMN "snapshotVersion",
DROP COLUMN "sourceJobId",
DROP COLUMN "title",
ADD COLUMN     "applicationStatus" "SavedJobApplicationStatus" DEFAULT 'SAVED',
ADD COLUMN     "jobSnapshotId" TEXT NOT NULL;

-- DropEnum
DROP TYPE "SavedJobAvailability";

-- CreateTable
CREATE TABLE "job_snapshot" (
    "id" TEXT NOT NULL,
    "canonicalJobId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "normalisedTitle" TEXT NOT NULL,
    "employerName" TEXT NOT NULL,
    "normalisedEmployerName" TEXT NOT NULL,
    "locationText" TEXT,
    "city" TEXT,
    "region" TEXT,
    "country" TEXT,
    "workStyle" TEXT,
    "salaryMin" DECIMAL(65,30),
    "salaryMax" DECIMAL(65,30),
    "salaryCurrency" TEXT,
    "salaryPeriod" TEXT,
    "salaryText" TEXT,
    "contractType" TEXT,
    "employmentType" TEXT,
    "seniority" TEXT,
    "providerDescription" TEXT,
    "userSuppliedDescription" TEXT,
    "descriptionAvailability" "JobDescriptionAvailability" NOT NULL,
    "selectedDescriptionSource" "JobDescriptionSource",
    "selectedDescriptionHash" TEXT,
    "vacancySponsorshipSignal" JSONB,
    "requirementEvidence" JSONB,
    "dedupeFingerprint" TEXT NOT NULL,
    "status" "JobSnapshotStatus" NOT NULL DEFAULT 'ACTIVE',
    "postedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_provider_reference" (
    "id" TEXT NOT NULL,
    "jobSnapshotId" TEXT NOT NULL,
    "provider" "JobProvider" NOT NULL,
    "providerJobId" TEXT NOT NULL,
    "providerUrl" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_provider_reference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_match_request" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "jobSnapshotId" TEXT NOT NULL,
    "selectedDescriptionSource" "JobDescriptionSource" NOT NULL,
    "selectedDescriptionHash" TEXT NOT NULL,
    "partialDescriptionAccepted" BOOLEAN NOT NULL DEFAULT false,
    "status" "JobMatchRequestStatus" NOT NULL DEFAULT 'PREPARED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),

    CONSTRAINT "job_match_request_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "job_snapshot_canonicalJobId_key" ON "job_snapshot"("canonicalJobId");

-- CreateIndex
CREATE INDEX "job_snapshot_dedupeFingerprint_idx" ON "job_snapshot"("dedupeFingerprint");

-- CreateIndex
CREATE INDEX "job_provider_reference_jobSnapshotId_idx" ON "job_provider_reference"("jobSnapshotId");

-- CreateIndex
CREATE UNIQUE INDEX "job_provider_reference_provider_providerJobId_key" ON "job_provider_reference"("provider", "providerJobId");

-- CreateIndex
CREATE INDEX "job_match_request_userId_createdAt_idx" ON "job_match_request"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "job_match_request_jobSnapshotId_idx" ON "job_match_request"("jobSnapshotId");

-- CreateIndex
CREATE INDEX "job_match_request_profileId_idx" ON "job_match_request"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "saved_job_userId_jobSnapshotId_key" ON "saved_job"("userId", "jobSnapshotId");

-- AddForeignKey
ALTER TABLE "job_provider_reference" ADD CONSTRAINT "job_provider_reference_jobSnapshotId_fkey" FOREIGN KEY ("jobSnapshotId") REFERENCES "job_snapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_job" ADD CONSTRAINT "saved_job_jobSnapshotId_fkey" FOREIGN KEY ("jobSnapshotId") REFERENCES "job_snapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_match_request" ADD CONSTRAINT "job_match_request_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_match_request" ADD CONSTRAINT "job_match_request_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_match_request" ADD CONSTRAINT "job_match_request_jobSnapshotId_fkey" FOREIGN KEY ("jobSnapshotId") REFERENCES "job_snapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

