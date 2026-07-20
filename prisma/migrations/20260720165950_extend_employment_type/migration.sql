-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EmploymentType" ADD VALUE 'FIXED_TERM';
ALTER TYPE "EmploymentType" ADD VALUE 'TEMPORARY_AGENCY';
ALTER TYPE "EmploymentType" ADD VALUE 'PLACEMENT';
ALTER TYPE "EmploymentType" ADD VALUE 'APPRENTICESHIP';
ALTER TYPE "EmploymentType" ADD VALUE 'FREELANCE';
ALTER TYPE "EmploymentType" ADD VALUE 'VOLUNTEER';
