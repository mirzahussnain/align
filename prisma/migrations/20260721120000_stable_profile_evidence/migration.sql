-- Give individual skills database-backed identities while retaining their
-- existing order and exact text, then add a small JSON provenance snapshot for
-- generated CVs. Analysis.jobMatchData is intentionally untouched.

CREATE TABLE "skill" (
    "id" TEXT NOT NULL,
    "skillGroupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "skill_pkey" PRIMARY KEY ("id")
);

INSERT INTO "skill" ("id", "skillGroupId", "name", "sortOrder")
SELECT
    'skill_' || md5(group_row."id" || ':' || skill_row.ordinality::text || ':' || skill_row.name),
    group_row."id",
    skill_row.name,
    (skill_row.ordinality - 1)::integer
FROM "skill_group" AS group_row
CROSS JOIN LATERAL unnest(group_row."skills") WITH ORDINALITY AS skill_row(name, ordinality);

CREATE INDEX "skill_skillGroupId_idx" ON "skill"("skillGroupId");

ALTER TABLE "skill"
    ADD CONSTRAINT "skill_skillGroupId_fkey"
    FOREIGN KEY ("skillGroupId") REFERENCES "skill_group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "skill_group" DROP COLUMN "skills";

ALTER TABLE "generated_cv" ADD COLUMN "provenance" JSONB;
