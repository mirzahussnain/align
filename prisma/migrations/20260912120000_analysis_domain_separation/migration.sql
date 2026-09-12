-- CreateEnum
CREATE TYPE "AnonymousAtsStatus" AS ENUM ('PROCESSING', 'READY', 'CLAIMED', 'EXPIRED', 'FAILED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "JobSnapshotStatus" ADD VALUE 'STALE';
ALTER TYPE "JobSnapshotStatus" ADD VALUE 'ARCHIVED';

-- DropForeignKey
ALTER TABLE "analysis" DROP CONSTRAINT "analysis_profileId_fkey";

-- DropForeignKey
ALTER TABLE "analysis" DROP CONSTRAINT "analysis_userId_fkey";

-- DropForeignKey
ALTER TABLE "application_evidence_context" DROP CONSTRAINT "application_evidence_context_analysisId_fkey";

-- DropForeignKey
ALTER TABLE "generated_cv" DROP CONSTRAINT "generated_cv_analysisId_fkey";

-- DropForeignKey
ALTER TABLE "profile_evidence_approval" DROP CONSTRAINT "profile_evidence_approval_analysisId_fkey";

-- DropIndex
DROP INDEX "application_evidence_context_userId_analysisId_requirementI_idx";

-- DropIndex
DROP INDEX "generated_cv_analysisId_idx";

-- DropIndex
DROP INDEX "profile_evidence_approval_userId_analysisId_requirementId_idx";

-- AlterTable
ALTER TABLE "application_evidence_context" DROP COLUMN "analysisId",
ADD COLUMN     "jobMatchId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "generated_cv" DROP COLUMN "analysisId",
ADD COLUMN     "jobMatchId" TEXT,
ADD COLUMN     "jobRevisionId" TEXT,
ADD COLUMN     "parentGeneratedCvId" TEXT,
ADD COLUMN     "profileSnapshotId" TEXT,
ADD COLUMN     "sourceCvRevisionId" TEXT,
ADD COLUMN     "versionNumber" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "profile_evidence_approval" DROP COLUMN "analysisId",
ADD COLUMN     "jobMatchId" TEXT NOT NULL;

-- DropTable
DROP TABLE "analysis";

-- CreateTable
CREATE TABLE "cv_revision" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "storedCvId" TEXT,
    "extractionId" TEXT,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "extractedText" TEXT NOT NULL,
    "pageCount" INTEGER,
    "parserVersion" TEXT NOT NULL,
    "sourceObjectKey" TEXT,
    "sourceObjectExpiresAt" TIMESTAMP(3),
    "sourceObjectDeletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cv_revision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ats_analysis" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "profileId" TEXT,
    "cvRevisionId" TEXT NOT NULL,
    "overallScore" INTEGER NOT NULL,
    "resultJson" JSONB NOT NULL,
    "scoringVersion" TEXT NOT NULL,
    "profileVersion" TEXT,
    "dictionaryVersion" TEXT,
    "occupation" TEXT,
    "applicationWorkflow" TEXT,
    "classification" JSONB,
    "aiEnhanced" BOOLEAN NOT NULL DEFAULT false,
    "aiProvider" TEXT,
    "aiModel" TEXT,
    "promptVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ats_analysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_revision" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "jobSnapshotId" TEXT,
    "title" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "location" TEXT,
    "description" TEXT NOT NULL,
    "descriptionSource" "JobDescriptionSource" NOT NULL,
    "descriptionHash" TEXT NOT NULL,
    "providerMetadataJson" JSONB,
    "sponsorshipMetadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_revision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "career_profile_snapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceProfileId" TEXT,
    "profileLabel" TEXT NOT NULL,
    "targetRole" TEXT,
    "targetOccupation" TEXT,
    "targetSeniority" TEXT,
    "targetIndustry" TEXT,
    "snapshotJson" JSONB NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "contentHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "career_profile_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_match" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cvRevisionId" TEXT NOT NULL,
    "jobRevisionId" TEXT NOT NULL,
    "profileSnapshotId" TEXT NOT NULL,
    "requestId" TEXT,
    "matchScore" INTEGER NOT NULL,
    "resultJson" JSONB NOT NULL,
    "algorithmVersion" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "aiProvider" TEXT,
    "aiModel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anonymous_ats_result" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "sessionHash" TEXT NOT NULL,
    "ipHash" TEXT NOT NULL,
    "status" "AnonymousAtsStatus" NOT NULL DEFAULT 'PROCESSING',
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "extractedText" TEXT NOT NULL,
    "pageCount" INTEGER,
    "resultJson" JSONB,
    "overallScore" INTEGER,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "claimedAt" TIMESTAMP(3),
    "claimedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "anonymous_ats_result_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cv_revision_userId_createdAt_idx" ON "cv_revision"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "cv_revision_storedCvId_idx" ON "cv_revision"("storedCvId");

-- CreateIndex
CREATE INDEX "cv_revision_sourceObjectExpiresAt_idx" ON "cv_revision"("sourceObjectExpiresAt");

-- CreateIndex
CREATE INDEX "ats_analysis_userId_createdAt_idx" ON "ats_analysis"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ats_analysis_profileId_idx" ON "ats_analysis"("profileId");

-- CreateIndex
CREATE INDEX "ats_analysis_cvRevisionId_idx" ON "ats_analysis"("cvRevisionId");

-- CreateIndex
CREATE INDEX "job_revision_jobSnapshotId_idx" ON "job_revision"("jobSnapshotId");

-- CreateIndex
CREATE INDEX "job_revision_userId_createdAt_idx" ON "job_revision"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "job_revision_descriptionHash_idx" ON "job_revision"("descriptionHash");

-- CreateIndex
CREATE INDEX "career_profile_snapshot_userId_createdAt_idx" ON "career_profile_snapshot"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "career_profile_snapshot_sourceProfileId_idx" ON "career_profile_snapshot"("sourceProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "job_match_requestId_key" ON "job_match"("requestId");

-- CreateIndex
CREATE INDEX "job_match_userId_createdAt_idx" ON "job_match"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "job_match_cvRevisionId_idx" ON "job_match"("cvRevisionId");

-- CreateIndex
CREATE INDEX "job_match_jobRevisionId_idx" ON "job_match"("jobRevisionId");

-- CreateIndex
CREATE INDEX "job_match_profileSnapshotId_idx" ON "job_match"("profileSnapshotId");

-- CreateIndex
CREATE UNIQUE INDEX "anonymous_ats_result_tokenHash_key" ON "anonymous_ats_result"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "anonymous_ats_result_sessionHash_key" ON "anonymous_ats_result"("sessionHash");

-- CreateIndex
CREATE INDEX "anonymous_ats_result_ipHash_createdAt_idx" ON "anonymous_ats_result"("ipHash", "createdAt");

-- CreateIndex
CREATE INDEX "anonymous_ats_result_expiresAt_status_idx" ON "anonymous_ats_result"("expiresAt", "status");

-- CreateIndex
CREATE INDEX "application_evidence_context_userId_jobMatchId_requirementI_idx" ON "application_evidence_context"("userId", "jobMatchId", "requirementId");

-- CreateIndex
CREATE INDEX "generated_cv_jobMatchId_idx" ON "generated_cv"("jobMatchId");

-- CreateIndex
CREATE INDEX "generated_cv_sourceCvRevisionId_idx" ON "generated_cv"("sourceCvRevisionId");

-- CreateIndex
CREATE INDEX "generated_cv_profileSnapshotId_idx" ON "generated_cv"("profileSnapshotId");

-- CreateIndex
CREATE INDEX "generated_cv_jobRevisionId_idx" ON "generated_cv"("jobRevisionId");

-- CreateIndex
CREATE INDEX "generated_cv_parentGeneratedCvId_idx" ON "generated_cv"("parentGeneratedCvId");

-- CreateIndex
CREATE INDEX "profile_evidence_approval_userId_jobMatchId_requirementId_idx" ON "profile_evidence_approval"("userId", "jobMatchId", "requirementId");

-- AddForeignKey
ALTER TABLE "profile_evidence_approval" ADD CONSTRAINT "profile_evidence_approval_jobMatchId_fkey" FOREIGN KEY ("jobMatchId") REFERENCES "job_match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_evidence_context" ADD CONSTRAINT "application_evidence_context_jobMatchId_fkey" FOREIGN KEY ("jobMatchId") REFERENCES "job_match"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cv_revision" ADD CONSTRAINT "cv_revision_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cv_revision" ADD CONSTRAINT "cv_revision_storedCvId_fkey" FOREIGN KEY ("storedCvId") REFERENCES "stored_cv"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cv_revision" ADD CONSTRAINT "cv_revision_extractionId_fkey" FOREIGN KEY ("extractionId") REFERENCES "cv_extraction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ats_analysis" ADD CONSTRAINT "ats_analysis_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ats_analysis" ADD CONSTRAINT "ats_analysis_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ats_analysis" ADD CONSTRAINT "ats_analysis_cvRevisionId_fkey" FOREIGN KEY ("cvRevisionId") REFERENCES "cv_revision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_revision" ADD CONSTRAINT "job_revision_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_revision" ADD CONSTRAINT "job_revision_jobSnapshotId_fkey" FOREIGN KEY ("jobSnapshotId") REFERENCES "job_snapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "career_profile_snapshot" ADD CONSTRAINT "career_profile_snapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "career_profile_snapshot" ADD CONSTRAINT "career_profile_snapshot_sourceProfileId_fkey" FOREIGN KEY ("sourceProfileId") REFERENCES "profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_match" ADD CONSTRAINT "job_match_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_match" ADD CONSTRAINT "job_match_cvRevisionId_fkey" FOREIGN KEY ("cvRevisionId") REFERENCES "cv_revision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_match" ADD CONSTRAINT "job_match_jobRevisionId_fkey" FOREIGN KEY ("jobRevisionId") REFERENCES "job_revision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_match" ADD CONSTRAINT "job_match_profileSnapshotId_fkey" FOREIGN KEY ("profileSnapshotId") REFERENCES "career_profile_snapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_match" ADD CONSTRAINT "job_match_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "job_match_request"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anonymous_ats_result" ADD CONSTRAINT "anonymous_ats_result_claimedByUserId_fkey" FOREIGN KEY ("claimedByUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_cv" ADD CONSTRAINT "generated_cv_jobMatchId_fkey" FOREIGN KEY ("jobMatchId") REFERENCES "job_match"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_cv" ADD CONSTRAINT "generated_cv_sourceCvRevisionId_fkey" FOREIGN KEY ("sourceCvRevisionId") REFERENCES "cv_revision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_cv" ADD CONSTRAINT "generated_cv_profileSnapshotId_fkey" FOREIGN KEY ("profileSnapshotId") REFERENCES "career_profile_snapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_cv" ADD CONSTRAINT "generated_cv_jobRevisionId_fkey" FOREIGN KEY ("jobRevisionId") REFERENCES "job_revision"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_cv" ADD CONSTRAINT "generated_cv_parentGeneratedCvId_fkey" FOREIGN KEY ("parentGeneratedCvId") REFERENCES "generated_cv"("id") ON DELETE SET NULL ON UPDATE CASCADE;
