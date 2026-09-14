CREATE TABLE "profile_evidence_approval" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "profileId" TEXT,
    "requirementId" TEXT NOT NULL,
    "evidenceType" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "snapshotVersion" INTEGER NOT NULL DEFAULT 1,
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "profile_evidence_approval_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "profile_evidence_approval_userId_analysisId_requirementId_idx" ON "profile_evidence_approval"("userId", "analysisId", "requirementId");
CREATE INDEX "profile_evidence_approval_profileId_idx" ON "profile_evidence_approval"("profileId");
ALTER TABLE "profile_evidence_approval" ADD CONSTRAINT "profile_evidence_approval_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "profile_evidence_approval" ADD CONSTRAINT "profile_evidence_approval_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "analysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "profile_evidence_approval" ADD CONSTRAINT "profile_evidence_approval_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
