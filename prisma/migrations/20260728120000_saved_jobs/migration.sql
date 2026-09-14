-- CreateEnum
CREATE TYPE "SavedJobAvailability" AS ENUM ('ACTIVE', 'EXPIRED', 'REMOVED', 'UNKNOWN');

-- CreateTable
CREATE TABLE "saved_job" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "profileId" TEXT,
  "primaryProvider" TEXT NOT NULL,
  "sourceJobId" TEXT NOT NULL,
  "canonicalUrl" TEXT NOT NULL,
  "canonicalIdentity" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "company" TEXT NOT NULL,
  "locationText" TEXT NOT NULL,
  "jobSnapshot" JSONB NOT NULL,
  "snapshotVersion" INTEGER NOT NULL DEFAULT 1,
  "availabilityStatus" "SavedJobAvailability" NOT NULL DEFAULT 'UNKNOWN',
  "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastCheckedAt" TIMESTAMP(3),
  "removedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "saved_job_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "saved_job_userId_canonicalIdentity_key" ON "saved_job"("userId", "canonicalIdentity");
CREATE INDEX "saved_job_userId_savedAt_idx" ON "saved_job"("userId", "savedAt");
CREATE INDEX "saved_job_profileId_idx" ON "saved_job"("profileId");
ALTER TABLE "saved_job" ADD CONSTRAINT "saved_job_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "saved_job" ADD CONSTRAINT "saved_job_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;