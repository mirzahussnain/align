-- CreateEnum
CREATE TYPE "StoredCvStatus" AS ENUM ('UPLOADING', 'STORED', 'EXTRACTING', 'READY', 'FAILED', 'EXPIRED', 'DELETED');

-- CreateEnum
CREATE TYPE "CvExtractionStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "CvImportSessionStatus" AS ENUM ('DRAFT', 'REVIEWING', 'PARTIALLY_IMPORTED', 'COMPLETED', 'ABANDONED', 'FAILED');

-- CreateEnum
CREATE TYPE "CvImportEntityType" AS ENUM ('IDENTITY_UPDATE', 'EXPERIENCE', 'PROJECT', 'EDUCATION', 'SKILL', 'CERTIFICATION', 'TRAINING', 'LICENCE', 'PROFESSIONAL_REGISTRATION', 'LANGUAGE', 'VOLUNTEERING', 'OTHER_EVIDENCE');

-- CreateEnum
CREATE TYPE "CvImportReviewStatus" AS ENUM ('PROPOSED', 'CONFIRMED', 'EDITED', 'REJECTED', 'DUPLICATE', 'CONFLICT');

-- CreateEnum
CREATE TYPE "OnboardingGoal" AS ENUM ('CHECK_CV', 'MATCH_JOB', 'BUILD_PROFILE', 'NO_CV');

-- CreateEnum
CREATE TYPE "OnboardingStage" AS ENUM ('GOAL', 'CV_SOURCE', 'UPLOAD', 'EXTRACTION', 'PROFILE_SELECTION', 'CAREER_DIRECTION', 'IMPORT_REVIEW', 'ELIGIBILITY_BASICS', 'FIRST_ACTION', 'COMPLETE');

-- CreateEnum
CREATE TYPE "OnboardingStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "OnboardingFirstValue" AS ENUM ('DETERMINISTIC_ATS', 'AI_ATS', 'JOB_MATCH', 'PROFILE_CREATED');

-- CreateTable
CREATE TABLE "stored_cv" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "storageProvider" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "sourceFormat" TEXT NOT NULL,
    "status" "StoredCvStatus" NOT NULL DEFAULT 'UPLOADING',
    "retentionEndsAt" TIMESTAMP(3),
    "objectDeletedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stored_cv_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cv_extraction" (
    "id" TEXT NOT NULL,
    "storedCvId" TEXT NOT NULL,
    "parserVersion" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "sourceFormat" TEXT NOT NULL,
    "status" "CvExtractionStatus" NOT NULL DEFAULT 'PENDING',
    "extractedText" TEXT,
    "structuredData" JSONB,
    "pageCount" INTEGER,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cv_extraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cv_import_session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "storedCvId" TEXT NOT NULL,
    "extractionId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "status" "CvImportSessionStatus" NOT NULL DEFAULT 'DRAFT',
    "reconciliationStatus" TEXT,
    "reconciliationOperationId" TEXT,
    "reconciliationRanAt" TIMESTAMP(3),
    "reconciliationSummary" JSONB,
    "importedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cv_import_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cv_import_candidate" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "storedCvId" TEXT NOT NULL,
    "extractionId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "entityType" "CvImportEntityType" NOT NULL,
    "structuredData" JSONB NOT NULL,
    "sourceExcerpt" TEXT NOT NULL,
    "sourceLocation" JSONB,
    "confidence" DOUBLE PRECISION,
    "reviewStatus" "CvImportReviewStatus" NOT NULL DEFAULT 'PROPOSED',
    "conflictCode" TEXT,
    "parserVersion" TEXT NOT NULL,
    "createdEntityType" TEXT,
    "createdEntityId" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "confirmedByUserId" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cv_import_candidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_state" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "goal" "OnboardingGoal",
    "stage" "OnboardingStage" NOT NULL DEFAULT 'GOAL',
    "status" "OnboardingStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "selectedProfileId" TEXT,
    "storedCvId" TEXT,
    "extractionId" TEXT,
    "importSessionId" TEXT,
    "firstValueType" "OnboardingFirstValue",
    "firstValueRef" TEXT,
    "firstValueCompletedAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "completedAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "onboarding_state_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stored_cv_storageKey_key" ON "stored_cv"("storageKey");

-- CreateIndex
CREATE INDEX "stored_cv_userId_status_idx" ON "stored_cv"("userId", "status");

-- CreateIndex
CREATE INDEX "stored_cv_retentionEndsAt_idx" ON "stored_cv"("retentionEndsAt");

-- CreateIndex
CREATE UNIQUE INDEX "stored_cv_userId_checksum_key" ON "stored_cv"("userId", "checksum");

-- CreateIndex
CREATE INDEX "cv_extraction_storedCvId_status_idx" ON "cv_extraction"("storedCvId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "cv_extraction_storedCvId_parserVersion_attempt_key" ON "cv_extraction"("storedCvId", "parserVersion", "attempt");

-- CreateIndex
CREATE INDEX "cv_import_session_userId_status_idx" ON "cv_import_session"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "cv_import_session_storedCvId_profileId_key" ON "cv_import_session"("storedCvId", "profileId");

-- CreateIndex
CREATE INDEX "cv_import_candidate_sessionId_reviewStatus_idx" ON "cv_import_candidate"("sessionId", "reviewStatus");

-- CreateIndex
CREATE INDEX "cv_import_candidate_userId_idx" ON "cv_import_candidate"("userId");

-- CreateIndex
CREATE INDEX "cv_import_candidate_createdEntityType_createdEntityId_idx" ON "cv_import_candidate"("createdEntityType", "createdEntityId");

-- CreateIndex
CREATE UNIQUE INDEX "cv_import_candidate_sessionId_dedupeKey_key" ON "cv_import_candidate"("sessionId", "dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_state_userId_key" ON "onboarding_state"("userId");

-- CreateIndex
CREATE INDEX "onboarding_state_userId_status_idx" ON "onboarding_state"("userId", "status");

-- AddForeignKey
ALTER TABLE "stored_cv" ADD CONSTRAINT "stored_cv_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cv_extraction" ADD CONSTRAINT "cv_extraction_storedCvId_fkey" FOREIGN KEY ("storedCvId") REFERENCES "stored_cv"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cv_import_session" ADD CONSTRAINT "cv_import_session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cv_import_session" ADD CONSTRAINT "cv_import_session_storedCvId_fkey" FOREIGN KEY ("storedCvId") REFERENCES "stored_cv"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cv_import_session" ADD CONSTRAINT "cv_import_session_extractionId_fkey" FOREIGN KEY ("extractionId") REFERENCES "cv_extraction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cv_import_session" ADD CONSTRAINT "cv_import_session_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cv_import_candidate" ADD CONSTRAINT "cv_import_candidate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cv_import_candidate" ADD CONSTRAINT "cv_import_candidate_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "cv_import_session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cv_import_candidate" ADD CONSTRAINT "cv_import_candidate_extractionId_fkey" FOREIGN KEY ("extractionId") REFERENCES "cv_extraction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_state" ADD CONSTRAINT "onboarding_state_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
