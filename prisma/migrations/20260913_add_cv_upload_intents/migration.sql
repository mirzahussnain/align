CREATE TYPE "CvUploadIntentStatus" AS ENUM ('PENDING', 'VALIDATING', 'COMPLETED', 'FAILED', 'EXPIRED');

CREATE TABLE "cv_upload_intent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "expectedMimeType" TEXT NOT NULL,
    "expectedSizeBytes" INTEGER NOT NULL,
    "status" "CvUploadIntentStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "failureCode" TEXT,
    "storedCvId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cv_upload_intent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cv_upload_intent_objectKey_key" ON "cv_upload_intent"("objectKey");
CREATE INDEX "cv_upload_intent_userId_status_expiresAt_idx" ON "cv_upload_intent"("userId", "status", "expiresAt");
CREATE INDEX "cv_upload_intent_status_expiresAt_idx" ON "cv_upload_intent"("status", "expiresAt");

ALTER TABLE "cv_upload_intent"
ADD CONSTRAINT "cv_upload_intent_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "cv_upload_intent"
ADD CONSTRAINT "cv_upload_intent_storedCvId_fkey"
FOREIGN KEY ("storedCvId") REFERENCES "stored_cv"("id") ON DELETE SET NULL ON UPDATE CASCADE;
