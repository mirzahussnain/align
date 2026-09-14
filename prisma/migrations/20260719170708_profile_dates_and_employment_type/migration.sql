/*
  Warnings:

  - The `type` column on the `experience` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Made the column `startDate` on table `education` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'INTERNSHIP');

-- AlterTable
ALTER TABLE "education" ADD COLUMN     "current" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "startDate" SET NOT NULL;

-- AlterTable
ALTER TABLE "experience" ADD COLUMN     "current" BOOLEAN NOT NULL DEFAULT false,
DROP COLUMN "type",
ADD COLUMN     "type" "EmploymentType";
