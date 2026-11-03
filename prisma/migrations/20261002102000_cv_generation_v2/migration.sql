-- CreateEnum
CREATE TYPE "CvGenerationSourceMode" AS ENUM ('JOB_MATCH', 'CAREER_PROFILE');

-- CreateEnum
CREATE TYPE "CvAtsStrategy" AS ENUM ('STANDARD', 'COMPOSITE');

-- CreateEnum
CREATE TYPE "CvGenerationStatus" AS ENUM ('DRAFT', 'RECONCILING', 'EVIDENCE_REVIEW', 'PLAN_PROPOSED', 'PLAN_APPROVED', 'GENERATING', 'COMPLETED', 'GENERATION_FAILED');

-- CreateEnum
CREATE TYPE "CvGenerationSnapshotReason" AS ENUM ('INITIAL', 'PROFILE_REFRESH', 'HITL_REUSABLE', 'HITL_APPLICATION_ONLY');

-- CreateEnum
CREATE TYPE "CvPlanRevisionKind" AS ENUM ('PROPOSED', 'APPROVED');

-- CreateEnum
CREATE TYPE "CvEvidenceEntityKind" AS ENUM ('EXPERIENCE', 'PROJECT', 'EDUCATION', 'CERTIFICATION', 'TRAINING', 'VOLUNTEERING', 'OPEN_SOURCE', 'OTHER');

-- CreateEnum
CREATE TYPE "CvEvidencePersistenceScope" AS ENUM ('CAREER_PROFILE_AND_APPLICATION', 'APPLICATION_ONLY');

-- DropForeignKey
ALTER TABLE "application_evidence_context" DROP CONSTRAINT "application_evidence_context_jobMatchId_fkey";

-- DropForeignKey
ALTER TABLE "application_evidence_context" DROP CONSTRAINT "application_evidence_context_profileId_fkey";

-- DropForeignKey
ALTER TABLE "application_evidence_context" DROP CONSTRAINT "application_evidence_context_userId_fkey";

-- DropForeignKey
ALTER TABLE "profile_evidence_approval" DROP CONSTRAINT "profile_evidence_approval_jobMatchId_fkey";

-- DropForeignKey
ALTER TABLE "profile_evidence_approval" DROP CONSTRAINT "profile_evidence_approval_profileId_fkey";

-- DropForeignKey
ALTER TABLE "profile_evidence_approval" DROP CONSTRAINT "profile_evidence_approval_userId_fkey";

-- AlterTable
ALTER TABLE "certification" ADD COLUMN     "evidenceMetadata" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "education" ADD COLUMN     "evidenceMetadata" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "experience" ADD COLUMN     "evidenceMetadata" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "generated_cv" ADD COLUMN     "cvGenerationId" TEXT;

-- AlterTable
ALTER TABLE "job_match" DROP COLUMN "algorithmVersion",
DROP COLUMN "resultJson",
ADD COLUMN     "advisoryJson" JSONB,
ADD COLUMN     "advisoryVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "analysisVersion" TEXT,
ADD COLUMN     "requirementLedgerJson" JSONB,
ADD COLUMN     "requirementLedgerVersion" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "other_evidence" ADD COLUMN     "evidenceMetadata" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "project_entry" ADD COLUMN     "evidenceMetadata" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "training" ADD COLUMN     "evidenceMetadata" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "volunteering" ADD COLUMN     "evidenceMetadata" JSONB NOT NULL DEFAULT '[]';

-- DropTable
DROP TABLE "application_evidence_context";

-- DropTable
DROP TABLE "profile_evidence_approval";

-- DropEnum
DROP TYPE "ProfileEvidenceKind";

-- CreateTable
CREATE TABLE "open_source_contribution" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "projectName" TEXT NOT NULL,
    "role" TEXT,
    "repositoryUrl" TEXT,
    "projectUrl" TEXT,
    "startDate" TEXT,
    "endDate" TEXT,
    "description" TEXT,
    "contributions" JSONB[],
    "technologies" TEXT[],
    "evidenceMetadata" JSONB NOT NULL DEFAULT '[]',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "open_source_contribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cv_generation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "sourceMode" "CvGenerationSourceMode" NOT NULL,
    "status" "CvGenerationStatus" NOT NULL DEFAULT 'DRAFT',
    "atsStrategy" "CvAtsStrategy" NOT NULL DEFAULT 'STANDARD',
    "profileId" TEXT,
    "jobMatchId" TEXT,
    "storedCvId" TEXT,
    "sourceExtractionId" TEXT,
    "sourceCvRevisionId" TEXT,
    "matchProfileSnapshotId" TEXT,
    "generationProfileSnapshotId" TEXT,
    "jobRevisionId" TEXT,
    "requirementLedgerVersion" INTEGER,
    "analysisVersion" TEXT,
    "targetContextJson" JSONB,
    "template" TEXT,
    "currentSnapshotVersion" INTEGER NOT NULL DEFAULT 0,
    "currentReconciliationVersion" INTEGER NOT NULL DEFAULT 0,
    "failureCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cv_generation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cv_generation_evidence_snapshot" (
    "id" TEXT NOT NULL,
    "generationId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "reason" "CvGenerationSnapshotReason" NOT NULL,
    "snapshotJson" JSONB NOT NULL,
    "schemaVersion" INTEGER NOT NULL,
    "contentHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cv_generation_evidence_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cv_requirement_reconciliation" (
    "id" TEXT NOT NULL,
    "generationId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshotVersion" INTEGER NOT NULL,
    "reconciliationJson" JSONB NOT NULL,
    "schemaVersion" INTEGER NOT NULL,
    "contentHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cv_requirement_reconciliation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cv_plan_revision" (
    "id" TEXT NOT NULL,
    "generationId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "kind" "CvPlanRevisionKind" NOT NULL,
    "planJson" JSONB NOT NULL,
    "schemaVersion" INTEGER NOT NULL,
    "contentHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cv_plan_revision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cv_application_evidence" (
    "id" TEXT NOT NULL,
    "generationId" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "entityKind" "CvEvidenceEntityKind" NOT NULL,
    "entityId" TEXT,
    "persistenceScope" "CvEvidencePersistenceScope" NOT NULL DEFAULT 'APPLICATION_ONLY',
    "evidenceJson" JSONB NOT NULL,
    "requirementIds" TEXT[],
    "sourceRefsJson" JSONB NOT NULL,
    "schemaVersion" INTEGER NOT NULL,
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cv_application_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "open_source_contribution_profileId_idx" ON "open_source_contribution"("profileId");

-- CreateIndex
CREATE INDEX "cv_generation_userId_createdAt_idx" ON "cv_generation"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "cv_generation_jobMatchId_idx" ON "cv_generation"("jobMatchId");

-- CreateIndex
CREATE INDEX "cv_generation_profileId_idx" ON "cv_generation"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "cv_generation_userId_operationId_key" ON "cv_generation"("userId", "operationId");

-- CreateIndex
CREATE INDEX "cv_generation_evidence_snapshot_generationId_createdAt_idx" ON "cv_generation_evidence_snapshot"("generationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "cv_generation_evidence_snapshot_generationId_version_key" ON "cv_generation_evidence_snapshot"("generationId", "version");

-- CreateIndex
CREATE INDEX "cv_requirement_reconciliation_generationId_createdAt_idx" ON "cv_requirement_reconciliation"("generationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "cv_requirement_reconciliation_generationId_version_key" ON "cv_requirement_reconciliation"("generationId", "version");

-- CreateIndex
CREATE INDEX "cv_plan_revision_generationId_kind_createdAt_idx" ON "cv_plan_revision"("generationId", "kind", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "cv_plan_revision_generationId_version_key" ON "cv_plan_revision"("generationId", "version");

-- CreateIndex
CREATE INDEX "cv_application_evidence_generationId_entityKind_idx" ON "cv_application_evidence"("generationId", "entityKind");

-- CreateIndex
CREATE UNIQUE INDEX "cv_application_evidence_generationId_evidenceId_key" ON "cv_application_evidence"("generationId", "evidenceId");

-- CreateIndex
CREATE UNIQUE INDEX "generated_cv_cvGenerationId_key" ON "generated_cv"("cvGenerationId");

-- AddForeignKey
ALTER TABLE "open_source_contribution" ADD CONSTRAINT "open_source_contribution_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cv_generation" ADD CONSTRAINT "cv_generation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cv_generation" ADD CONSTRAINT "cv_generation_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cv_generation" ADD CONSTRAINT "cv_generation_jobMatchId_fkey" FOREIGN KEY ("jobMatchId") REFERENCES "job_match"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cv_generation" ADD CONSTRAINT "cv_generation_storedCvId_fkey" FOREIGN KEY ("storedCvId") REFERENCES "stored_cv"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cv_generation" ADD CONSTRAINT "cv_generation_sourceExtractionId_fkey" FOREIGN KEY ("sourceExtractionId") REFERENCES "cv_extraction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cv_generation" ADD CONSTRAINT "cv_generation_sourceCvRevisionId_fkey" FOREIGN KEY ("sourceCvRevisionId") REFERENCES "cv_revision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cv_generation" ADD CONSTRAINT "cv_generation_matchProfileSnapshotId_fkey" FOREIGN KEY ("matchProfileSnapshotId") REFERENCES "career_profile_snapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cv_generation" ADD CONSTRAINT "cv_generation_generationProfileSnapshotId_fkey" FOREIGN KEY ("generationProfileSnapshotId") REFERENCES "career_profile_snapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cv_generation" ADD CONSTRAINT "cv_generation_jobRevisionId_fkey" FOREIGN KEY ("jobRevisionId") REFERENCES "job_revision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cv_generation_evidence_snapshot" ADD CONSTRAINT "cv_generation_evidence_snapshot_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "cv_generation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cv_requirement_reconciliation" ADD CONSTRAINT "cv_requirement_reconciliation_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "cv_generation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cv_plan_revision" ADD CONSTRAINT "cv_plan_revision_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "cv_generation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cv_application_evidence" ADD CONSTRAINT "cv_application_evidence_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "cv_generation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_cv" ADD CONSTRAINT "generated_cv_cvGenerationId_fkey" FOREIGN KEY ("cvGenerationId") REFERENCES "cv_generation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
