-- Preserve each completed company check by sponsor-register release so a new
-- release can replace CompanyRecord's current evidence without erasing history.
CREATE TABLE "company_sponsor_history" (
    "id" TEXT NOT NULL,
    "companyRecordId" TEXT NOT NULL,
    "registerVersion" TEXT NOT NULL,
    "matchStatus" "SponsorMatchStatus" NOT NULL,
    "organisationName" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL,
    "evidence" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_sponsor_history_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "company_sponsor_history_companyRecordId_registerVersion_key"
ON "company_sponsor_history"("companyRecordId", "registerVersion");

CREATE INDEX "company_sponsor_history_companyRecordId_checkedAt_idx"
ON "company_sponsor_history"("companyRecordId", "checkedAt");

CREATE INDEX "company_sponsor_history_registerVersion_idx"
ON "company_sponsor_history"("registerVersion");

ALTER TABLE "company_sponsor_history"
ADD CONSTRAINT "company_sponsor_history_companyRecordId_fkey"
FOREIGN KEY ("companyRecordId") REFERENCES "company_record"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- Capture the evidence that predates release 2 before the application refreshes
-- CompanyRecord against the bundled release.
INSERT INTO "company_sponsor_history" (
    "id",
    "companyRecordId",
    "registerVersion",
    "matchStatus",
    "organisationName",
    "checkedAt",
    "evidence",
    "createdAt"
)
SELECT
    'csh_' || md5("id" || ':' || "sponsorRegisterVersion"),
    "id",
    "sponsorRegisterVersion",
    "sponsorMatchStatus",
    "sponsorOrganisationName",
    COALESCE("sponsorCheckedAt", "updatedAt"),
    "sponsorEvidence",
    COALESCE("sponsorCheckedAt", "updatedAt")
FROM "company_record"
WHERE "sponsorRegisterVersion" IS NOT NULL
  AND "sponsorMatchStatus" <> 'NOT_CHECKED'
ON CONFLICT ("companyRecordId", "registerVersion") DO NOTHING;
