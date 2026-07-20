-- AlterTable
ALTER TABLE "analysis" ADD COLUMN     "applicationWorkflow" TEXT,
ADD COLUMN     "classification" JSONB,
ADD COLUMN     "dictionaryVersion" TEXT,
ADD COLUMN     "occupation" TEXT,
ADD COLUMN     "profileVersion" TEXT,
ADD COLUMN     "scoringVersion" INTEGER;

-- AlterTable
ALTER TABLE "profile" ADD COLUMN     "targetOccupation" TEXT,
ADD COLUMN     "targetRoleTitle" TEXT,
ADD COLUMN     "targetSeniority" TEXT;
