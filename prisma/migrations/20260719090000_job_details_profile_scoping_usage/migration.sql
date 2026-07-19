-- Three related additions, applied together so there is one schema change to review.
--
--   1. JOB DETAILS   — analysis.jobTitle / jobCompany, so a job-match row in the
--                      history table reads "Senior Data Engineer at FinCore"
--                      instead of three identical "cv.pdf · Job match" rows.
--   2. PROFILE SCOPE — analysis.profileId, so each career track shows its own
--                      analyses rather than one undifferentiated pile.
--   3. USAGE METERING— usage_counter, the only honest record of monthly AI
--                      consumption (analysis rows get pruned, so counting them
--                      would refund quota on every prune).
--
-- All three are additive. No column is dropped and no existing row is deleted.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Job details
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "analysis" ADD COLUMN "jobTitle" TEXT;
ALTER TABLE "analysis" ADD COLUMN "jobCompany" TEXT;

-- Backfill existing job matches from the stored JD's first non-empty line. The
-- matcher now extracts these properly, but rows analysed before this migration
-- have no extraction to draw on and would otherwise stay blank forever. A first
-- line is right often enough to be useful and is capped so a JD pasted as one
-- long paragraph cannot produce a title the width of the table.
UPDATE "analysis"
SET "jobTitle" = NULLIF(
      btrim(substring(btrim("jobDescription") FROM '^[^\n\r]{1,120}')),
      ''
    )
WHERE "mode" = 'job_match'
  AND "jobDescription" IS NOT NULL
  AND "jobTitle" IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Profile scoping
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "analysis" ADD COLUMN "profileId" TEXT;

ALTER TABLE "analysis"
  ADD CONSTRAINT "analysis_profileId_fkey"
  FOREIGN KEY ("profileId") REFERENCES "profile"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "analysis_profileId_idx" ON "analysis"("profileId");

-- Every analysis that exists today was run before profiles could be switched,
-- so it belongs to whichever profile is the user's default. Falling back to the
-- oldest profile covers any row whose user somehow has no default flagged.
UPDATE "analysis" a
SET "profileId" = (
  SELECT p."id"
  FROM "profile" p
  WHERE p."userId" = a."userId"
  ORDER BY p."isDefault" DESC, p."createdAt" ASC
  LIMIT 1
)
WHERE a."profileId" IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Usage metering
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE "usage_counter" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "aiAnalyses" INTEGER NOT NULL DEFAULT 0,
    "cvGenerations" INTEGER NOT NULL DEFAULT 0,
    "profileReasoning" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usage_counter_pkey" PRIMARY KEY ("id")
);

-- The unique pair is what makes the increment a single atomic upsert.
CREATE UNIQUE INDEX "usage_counter_userId_period_key" ON "usage_counter"("userId", "period");
CREATE INDEX "usage_counter_userId_idx" ON "usage_counter"("userId");

ALTER TABLE "usage_counter"
  ADD CONSTRAINT "usage_counter_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Deliberately NOT backfilled. Historic consumption is unknowable — analyses
-- have been pruned — and inventing a starting number would either hand out free
-- quota or bill users for calls no record proves they made. Metering starts now.
