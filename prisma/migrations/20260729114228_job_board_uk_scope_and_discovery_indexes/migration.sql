-- CreateIndex
CREATE INDEX "job_snapshot_status_lastSeenAt_idx" ON "job_snapshot"("status", "lastSeenAt");

-- CreateIndex
CREATE INDEX "job_snapshot_companyRecordId_postedAt_idx" ON "job_snapshot"("companyRecordId", "postedAt");
