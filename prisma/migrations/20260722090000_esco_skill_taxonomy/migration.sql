-- A local optional ESCO reference. User skills remain independently owned.
CREATE TABLE "skill_taxonomy_term" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceVersion" TEXT NOT NULL,
    "externalUri" TEXT NOT NULL,
    "preferredLabel" TEXT NOT NULL,
    "normalizedLabel" TEXT NOT NULL,
    "alternativeLabels" TEXT[] NOT NULL,
    "description" TEXT,
    "conceptType" TEXT,
    "searchText" TEXT NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "skill_taxonomy_term_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "skill" ADD COLUMN "normalizedName" TEXT NOT NULL DEFAULT '';
ALTER TABLE "skill" ADD COLUMN "taxonomyTermId" TEXT;

UPDATE "skill"
SET "normalizedName" = lower(regexp_replace(btrim("name"), '\s+', ' ', 'g'));

ALTER TABLE "skill" ALTER COLUMN "normalizedName" DROP DEFAULT;

CREATE UNIQUE INDEX "skill_taxonomy_term_externalUri_key" ON "skill_taxonomy_term"("externalUri");
CREATE INDEX "skill_taxonomy_term_source_sourceVersion_idx" ON "skill_taxonomy_term"("source", "sourceVersion");
CREATE INDEX "skill_taxonomy_term_normalizedLabel_idx" ON "skill_taxonomy_term"("normalizedLabel");
CREATE INDEX "skill_taxonomyTermId_idx" ON "skill"("taxonomyTermId");
CREATE UNIQUE INDEX "skill_profileId_normalizedName_key" ON "skill"("profileId", "normalizedName");

ALTER TABLE "skill" ADD CONSTRAINT "skill_taxonomyTermId_fkey"
  FOREIGN KEY ("taxonomyTermId") REFERENCES "skill_taxonomy_term"("id") ON DELETE SET NULL ON UPDATE CASCADE;
