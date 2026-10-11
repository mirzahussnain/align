-- Replace the legacy boolean/scalar preference representation without leaving
-- competing columns behind. Existing answers retain their meaning.
CREATE TYPE "RelocationPreference" AS ENUM ('YES', 'NO', 'CONSIDER');
CREATE TYPE "WorkStylePreference" AS ENUM ('REMOTE', 'HYBRID', 'ONSITE');

ALTER TABLE "profile_practical_facts"
ADD COLUMN "relocationPreference" "RelocationPreference",
ADD COLUMN "preferredWorkStyles" "WorkStylePreference"[] NOT NULL DEFAULT ARRAY[]::"WorkStylePreference"[];

UPDATE "profile_practical_facts"
SET "relocationPreference" = CASE
  WHEN "openToRelocation" IS TRUE THEN 'YES'::"RelocationPreference"
  WHEN "openToRelocation" IS FALSE THEN 'NO'::"RelocationPreference"
  ELSE NULL
END,
"preferredWorkStyles" = CASE "workPatternPreference"
  WHEN 'REMOTE_ONLY'::"WorkPatternPreference" THEN ARRAY['REMOTE'::"WorkStylePreference"]
  WHEN 'HYBRID'::"WorkPatternPreference" THEN ARRAY['HYBRID'::"WorkStylePreference"]
  WHEN 'ONSITE'::"WorkPatternPreference" THEN ARRAY['ONSITE'::"WorkStylePreference"]
  WHEN 'FLEXIBLE'::"WorkPatternPreference" THEN ARRAY[
    'REMOTE'::"WorkStylePreference",
    'HYBRID'::"WorkStylePreference",
    'ONSITE'::"WorkStylePreference"
  ]
  ELSE ARRAY[]::"WorkStylePreference"[]
END;

ALTER TABLE "profile_practical_facts"
DROP COLUMN "openToRelocation",
DROP COLUMN "workPatternPreference";

DROP TYPE "WorkPatternPreference";

ALTER TABLE "job_match"
ADD COLUMN "practicalCompatibilityJson" JSONB,
ADD COLUMN "practicalCompatibilityVersion" INTEGER NOT NULL DEFAULT 1;
