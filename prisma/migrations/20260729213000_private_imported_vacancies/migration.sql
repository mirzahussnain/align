-- User-imported vacancies contain user-pasted descriptions, so they must never
-- be exposed as shared discovery snapshots.
ALTER TABLE "job_snapshot"
ADD COLUMN "importedByUserId" TEXT,
ADD COLUMN "importedUrl" TEXT;

ALTER TABLE "job_snapshot"
ADD CONSTRAINT "job_snapshot_importedByUserId_fkey"
FOREIGN KEY ("importedByUserId") REFERENCES "user"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "job_snapshot_importedByUserId_createdAt_idx"
ON "job_snapshot"("importedByUserId", "createdAt");
