-- DropForeignKey
ALTER TABLE "language" DROP CONSTRAINT "language_profileId_fkey";

-- DropForeignKey
ALTER TABLE "licence" DROP CONSTRAINT "licence_profileId_fkey";

-- DropForeignKey
ALTER TABLE "other_evidence" DROP CONSTRAINT "other_evidence_profileId_fkey";

-- DropForeignKey
ALTER TABLE "professional_registration" DROP CONSTRAINT "professional_registration_profileId_fkey";

-- DropForeignKey
ALTER TABLE "training" DROP CONSTRAINT "training_profileId_fkey";

-- DropForeignKey
ALTER TABLE "volunteering" DROP CONSTRAINT "volunteering_profileId_fkey";

-- AlterTable
ALTER TABLE "education" ALTER COLUMN "startDate" DROP NOT NULL;

-- AlterTable
ALTER TABLE "language" ALTER COLUMN "speaking" DROP NOT NULL,
ALTER COLUMN "reading" DROP NOT NULL,
ALTER COLUMN "writing" DROP NOT NULL;

-- AlterTable
ALTER TABLE "licence" ALTER COLUMN "issuingBody" DROP NOT NULL,
ALTER COLUMN "status" DROP NOT NULL,
ALTER COLUMN "verificationStatus" DROP NOT NULL;

-- AlterTable
ALTER TABLE "other_evidence" ALTER COLUMN "context" DROP NOT NULL;

-- AlterTable
ALTER TABLE "professional_registration" ALTER COLUMN "status" DROP NOT NULL,
ALTER COLUMN "verificationStatus" DROP NOT NULL;

-- AlterTable
ALTER TABLE "training" ALTER COLUMN "provider" DROP NOT NULL,
ALTER COLUMN "status" DROP NOT NULL;

-- AlterTable
ALTER TABLE "volunteering" ALTER COLUMN "contribution" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "training" ADD CONSTRAINT "training_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "licence" ADD CONSTRAINT "licence_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "professional_registration" ADD CONSTRAINT "professional_registration_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "language" ADD CONSTRAINT "language_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "volunteering" ADD CONSTRAINT "volunteering_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "other_evidence" ADD CONSTRAINT "other_evidence_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "application_evidence_context_userId_analysisId_requirementId_id" RENAME TO "application_evidence_context_userId_analysisId_requirementI_idx";
