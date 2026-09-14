ALTER TABLE "job_snapshot"
  ADD COLUMN "descriptionAssessment" JSONB,
  ADD COLUMN "employerSponsorEvidence" JSONB,
  ADD COLUMN "intelligenceAssessedAt" TIMESTAMP(3);
