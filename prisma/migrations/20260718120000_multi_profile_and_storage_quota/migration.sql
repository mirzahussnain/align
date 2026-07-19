-- Splits `profile` into identity (one per user) + career-track profiles (many
-- per user), and adds the columns storage quota accounting needs.
--
-- Written by hand rather than generated, because the identity split must CARRY
-- EXISTING DATA ACROSS: every current profile row becomes one `profile_identity`
-- row plus one `profile` row labelled "Default". No user loses data and no
-- child row (experience/projects/education/skills/certifications) is touched —
-- they keep pointing at the same profile id.

-- 1. Identity table, populated from the existing profile rows.
CREATE TABLE "profile_identity" (
    "id"            TEXT NOT NULL,
    "userId"        TEXT NOT NULL,
    "fullName"      TEXT NOT NULL,
    "email"         TEXT,
    "phoneDialCode" TEXT,
    "phoneNumber"   TEXT,
    "phoneCountry"  TEXT,
    "city"          TEXT,
    "state"         TEXT,
    "country"       TEXT,
    "website"       TEXT,
    "linkedin"      TEXT,
    "github"        TEXT,
    "visaStatus"    "VisaStatus",
    "visaExpiry"    TIMESTAMP(3),
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profile_identity_pkey" PRIMARY KEY ("id")
);

-- Reuses the profile's own id so the mapping stays traceable after the fact.
INSERT INTO "profile_identity" (
    "id", "userId", "fullName", "email", "phoneDialCode", "phoneNumber",
    "phoneCountry", "city", "state", "country", "website", "linkedin",
    "github", "visaStatus", "visaExpiry", "createdAt", "updatedAt"
)
SELECT
    "id", "userId", "fullName", "email", "phoneDialCode", "phoneNumber",
    "phoneCountry", "city", "state", "country", "website", "linkedin",
    "github", "visaStatus", "visaExpiry", "createdAt", "updatedAt"
FROM "profile";

CREATE UNIQUE INDEX "profile_identity_userId_key" ON "profile_identity"("userId");

ALTER TABLE "profile_identity"
    ADD CONSTRAINT "profile_identity_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 2. Career-track columns on the existing profile table. Defaults backfill every
--    existing row as the user's default profile before the defaults are dropped.
ALTER TABLE "profile" ADD COLUMN "label"          TEXT NOT NULL DEFAULT 'Default';
ALTER TABLE "profile" ADD COLUMN "isDefault"      BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "profile" ADD COLUMN "targetIndustry" TEXT;

UPDATE "profile" SET "isDefault" = true;

-- 3. Identity columns now live in profile_identity; drop them from profile.
ALTER TABLE "profile" DROP COLUMN "fullName";
ALTER TABLE "profile" DROP COLUMN "email";
ALTER TABLE "profile" DROP COLUMN "phoneDialCode";
ALTER TABLE "profile" DROP COLUMN "phoneNumber";
ALTER TABLE "profile" DROP COLUMN "phoneCountry";
ALTER TABLE "profile" DROP COLUMN "city";
ALTER TABLE "profile" DROP COLUMN "state";
ALTER TABLE "profile" DROP COLUMN "country";
ALTER TABLE "profile" DROP COLUMN "website";
ALTER TABLE "profile" DROP COLUMN "linkedin";
ALTER TABLE "profile" DROP COLUMN "github";
ALTER TABLE "profile" DROP COLUMN "visaStatus";
ALTER TABLE "profile" DROP COLUMN "visaExpiry";

-- 4. A user may now hold several profiles, so the one-per-user constraint goes.
DROP INDEX IF EXISTS "profile_userId_key";
CREATE INDEX "profile_userId_idx" ON "profile"("userId");
CREATE UNIQUE INDEX "profile_userId_label_key" ON "profile"("userId", "label");

-- 5. Storage quota accounting. Sizes are nullable: rows archived before this
--    migration have unknown byte counts and are treated as 0 until re-archived.
ALTER TABLE "analysis" ADD COLUMN "sourceFileSize"  INTEGER;
ALTER TABLE "analysis" ADD COLUMN "sourceExpiresAt" TIMESTAMP(3);
CREATE INDEX "analysis_sourceExpiresAt_idx" ON "analysis"("sourceExpiresAt");

ALTER TABLE "generated_cv" ADD COLUMN "fileSize"  INTEGER;
ALTER TABLE "generated_cv" ADD COLUMN "profileId" TEXT;
CREATE INDEX "generated_cv_profileId_idx" ON "generated_cv"("profileId");

ALTER TABLE "generated_cv"
    ADD CONSTRAINT "generated_cv_profileId_fkey"
    FOREIGN KEY ("profileId") REFERENCES "profile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
