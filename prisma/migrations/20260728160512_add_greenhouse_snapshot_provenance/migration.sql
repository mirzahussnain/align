-- AlterTable
ALTER TABLE "job_snapshot" ADD COLUMN     "employerSourceId" TEXT;

-- CreateIndex
CREATE INDEX "job_snapshot_employerSourceId_idx" ON "job_snapshot"("employerSourceId");

-- AddForeignKey
ALTER TABLE "job_snapshot" ADD CONSTRAINT "job_snapshot_employerSourceId_fkey" FOREIGN KEY ("employerSourceId") REFERENCES "employer_job_source"("id") ON DELETE SET NULL ON UPDATE CASCADE;
