-- Requirement-led structured evidence: reusable facts live in concrete profile
-- entities; application-only facts remain scoped to an analysis and requirement.
CREATE TYPE "ProfileEvidenceKind" AS ENUM ('SKILL_TOOL', 'EMPLOYMENT', 'PROJECT', 'EDUCATION', 'TRAINING', 'CERTIFICATION', 'LICENCE', 'REGISTRATION', 'LANGUAGE', 'VOLUNTEERING', 'OTHER');

CREATE TABLE "application_evidence_context" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "analysisId" TEXT NOT NULL,
  "profileId" TEXT,
  "requirementId" TEXT NOT NULL,
  "kind" "ProfileEvidenceKind" NOT NULL,
  "details" JSONB NOT NULL,
  "approvedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "application_evidence_context_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "application_evidence_context_userId_analysisId_requirementId_idx" ON "application_evidence_context"("userId", "analysisId", "requirementId");
ALTER TABLE "application_evidence_context" ADD CONSTRAINT "application_evidence_context_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "application_evidence_context" ADD CONSTRAINT "application_evidence_context_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "analysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "application_evidence_context" ADD CONSTRAINT "application_evidence_context_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- Corrective pre-launch migration: ProfileEvidence was a duplicate generic
-- store. Local rows are disposable HITL drafts and are removed; reusable facts
-- henceforth live only in the concrete profile entities below.
ALTER TABLE "skill" ADD COLUMN "level" TEXT, ADD COLUMN "contextType" TEXT, ADD COLUMN "linkedEvidenceId" TEXT, ADD COLUMN "activity" TEXT, ADD COLUMN "period" TEXT, ADD COLUMN "outcome" TEXT;
ALTER TABLE "certification" ADD COLUMN "issueDate" TEXT, ADD COLUMN "expiryDate" TEXT, ADD COLUMN "credentialNumber" TEXT, ADD COLUMN "status" TEXT, ADD COLUMN "verificationUrl" TEXT, ADD COLUMN "verificationStatus" TEXT;

CREATE TABLE "training" ("id" TEXT NOT NULL, "profileId" TEXT NOT NULL, "course" TEXT NOT NULL, "provider" TEXT NOT NULL, "field" TEXT, "status" TEXT NOT NULL, "startDate" TEXT, "endDate" TEXT, "result" TEXT, CONSTRAINT "training_pkey" PRIMARY KEY ("id"));
CREATE TABLE "licence" ("id" TEXT NOT NULL, "profileId" TEXT NOT NULL, "officialName" TEXT NOT NULL, "issuingBody" TEXT NOT NULL, "issueDate" TEXT, "expiryDate" TEXT, "credentialNumber" TEXT, "status" TEXT NOT NULL, "verificationUrl" TEXT, "verificationStatus" TEXT NOT NULL, CONSTRAINT "licence_pkey" PRIMARY KEY ("id"));
CREATE TABLE "professional_registration" ("id" TEXT NOT NULL, "profileId" TEXT NOT NULL, "officialName" TEXT NOT NULL, "issuingBody" TEXT NOT NULL, "issueDate" TEXT, "expiryDate" TEXT, "registrationNumber" TEXT, "status" TEXT NOT NULL, "verificationUrl" TEXT, "verificationStatus" TEXT NOT NULL, CONSTRAINT "professional_registration_pkey" PRIMARY KEY ("id"));
CREATE TABLE "language" ("id" TEXT NOT NULL, "profileId" TEXT NOT NULL, "language" TEXT NOT NULL, "speaking" TEXT NOT NULL, "reading" TEXT NOT NULL, "writing" TEXT NOT NULL, "professionalUseContext" TEXT, "formalTest" TEXT, CONSTRAINT "language_pkey" PRIMARY KEY ("id"));
CREATE TABLE "volunteering" ("id" TEXT NOT NULL, "profileId" TEXT NOT NULL, "organisation" TEXT NOT NULL, "role" TEXT NOT NULL, "startDate" TEXT, "endDate" TEXT, "contribution" TEXT NOT NULL, "skillsTools" TEXT[] NOT NULL, "outcome" TEXT, CONSTRAINT "volunteering_pkey" PRIMARY KEY ("id"));
CREATE TABLE "other_evidence" ("id" TEXT NOT NULL, "profileId" TEXT NOT NULL, "title" TEXT NOT NULL, "context" TEXT NOT NULL, "description" TEXT NOT NULL, "period" TEXT, "outcome" TEXT, CONSTRAINT "other_evidence_pkey" PRIMARY KEY ("id"));
CREATE INDEX "training_profileId_idx" ON "training"("profileId"); CREATE INDEX "licence_profileId_idx" ON "licence"("profileId"); CREATE INDEX "professional_registration_profileId_idx" ON "professional_registration"("profileId"); CREATE INDEX "language_profileId_idx" ON "language"("profileId"); CREATE INDEX "volunteering_profileId_idx" ON "volunteering"("profileId"); CREATE INDEX "other_evidence_profileId_idx" ON "other_evidence"("profileId");
ALTER TABLE "training" ADD CONSTRAINT "training_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profile"("id") ON DELETE CASCADE; ALTER TABLE "licence" ADD CONSTRAINT "licence_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profile"("id") ON DELETE CASCADE; ALTER TABLE "professional_registration" ADD CONSTRAINT "professional_registration_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profile"("id") ON DELETE CASCADE; ALTER TABLE "language" ADD CONSTRAINT "language_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profile"("id") ON DELETE CASCADE; ALTER TABLE "volunteering" ADD CONSTRAINT "volunteering_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profile"("id") ON DELETE CASCADE; ALTER TABLE "other_evidence" ADD CONSTRAINT "other_evidence_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profile"("id") ON DELETE CASCADE;
