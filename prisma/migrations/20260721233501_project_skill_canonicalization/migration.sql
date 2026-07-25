/*
  Warnings:

  - You are about to drop the column `stack` on the `project_entry` table. All the data in the column will be lost.
  - Added the required column `profileId` to the `skill` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "skill" DROP CONSTRAINT "skill_skillGroupId_fkey";

-- AlterTable
ALTER TABLE "project_entry" DROP COLUMN "stack",
ADD COLUMN     "liveUrl" TEXT,
ADD COLUMN     "repositoryUrl" TEXT;

-- AlterTable
ALTER TABLE "skill" ADD COLUMN     "profileId" TEXT NOT NULL,
ALTER COLUMN "skillGroupId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "project_skill" (
    "projectId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "project_skill_pkey" PRIMARY KEY ("projectId","skillId")
);

-- CreateIndex
CREATE INDEX "project_skill_skillId_idx" ON "project_skill"("skillId");

-- CreateIndex
CREATE INDEX "skill_profileId_idx" ON "skill"("profileId");

-- AddForeignKey
ALTER TABLE "skill" ADD CONSTRAINT "skill_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill" ADD CONSTRAINT "skill_skillGroupId_fkey" FOREIGN KEY ("skillGroupId") REFERENCES "skill_group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_skill" ADD CONSTRAINT "project_skill_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project_entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_skill" ADD CONSTRAINT "project_skill_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
