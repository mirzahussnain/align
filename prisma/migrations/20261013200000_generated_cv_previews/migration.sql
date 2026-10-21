-- CreateEnum
CREATE TYPE "GeneratedCvPreviewStatus" AS ENUM ('PENDING', 'RENDERING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "GeneratedCvPreviewFailureCode" AS ENUM ('THUMBNAIL_RENDER_FAILED', 'PREVIEW_STORAGE_FAILED', 'PREVIEW_LEASE_EXPIRED');

-- AlterTable
ALTER TABLE "cv_generation"
ADD COLUMN "generationLeaseToken" TEXT,
ADD COLUMN "generationLeaseExpiresAt" TIMESTAMP(3),
ADD COLUMN "generationAttemptCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "validatedAiCheckpoint" JSONB;

-- CreateTable
CREATE TABLE "generated_cv_preview" (
    "id" TEXT NOT NULL,
    "generatedCvId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "documentHash" TEXT NOT NULL,
    "rendererVersion" TEXT NOT NULL,
    "status" "GeneratedCvPreviewStatus" NOT NULL DEFAULT 'PENDING',
    "failureCode" "GeneratedCvPreviewFailureCode",
    "pageCount" INTEGER,
    "pdfKey" TEXT,
    "pageImageKeys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "pdfSize" INTEGER,
    "pageImageSizes" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "leaseExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "generated_cv_preview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "generated_cv_preview_generatedCvId_key" ON "generated_cv_preview"("generatedCvId");

-- CreateIndex
CREATE INDEX "generated_cv_preview_userId_documentHash_idx" ON "generated_cv_preview"("userId", "documentHash");

-- CreateIndex
CREATE INDEX "generated_cv_preview_status_leaseExpiresAt_idx" ON "generated_cv_preview"("status", "leaseExpiresAt");

-- AddForeignKey
ALTER TABLE "generated_cv_preview" ADD CONSTRAINT "generated_cv_preview_generatedCvId_fkey" FOREIGN KEY ("generatedCvId") REFERENCES "generated_cv"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_cv_preview" ADD CONSTRAINT "generated_cv_preview_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
