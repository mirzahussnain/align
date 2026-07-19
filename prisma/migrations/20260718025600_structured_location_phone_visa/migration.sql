-- CreateEnum
CREATE TYPE "VisaStatus" AS ENUM ('BRITISH_CITIZEN', 'IRISH_CITIZEN', 'SETTLED', 'PRE_SETTLED', 'SKILLED_WORKER', 'HEALTH_CARE_WORKER', 'GRADUATE', 'STUDENT', 'DEPENDANT', 'GLOBAL_TALENT', 'HIGH_POTENTIAL', 'YOUTH_MOBILITY', 'OTHER_SPONSORSHIP');

-- AlterTable: replace free-text location/phone/visaStatus with structured columns
ALTER TABLE "profile"
  DROP COLUMN "location",
  DROP COLUMN "phone",
  DROP COLUMN "visaStatus",
  ADD COLUMN "phoneDialCode" TEXT,
  ADD COLUMN "phoneNumber" TEXT,
  ADD COLUMN "city" TEXT,
  ADD COLUMN "state" TEXT,
  ADD COLUMN "country" TEXT,
  ADD COLUMN "visaStatus" "VisaStatus",
  ADD COLUMN "visaExpiry" TIMESTAMP(3);
