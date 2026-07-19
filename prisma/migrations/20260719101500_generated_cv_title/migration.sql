-- A generated CV was labelled by its renderer ("Architect Template"), which
-- says nothing about what the document is for. The rewritten payload already
-- carries a tagline ("Senior Data Engineer · Streaming · 6 yrs"); this promotes
-- it to a column so listing CVs doesn't mean deserialising every full payload.
ALTER TABLE "generated_cv" ADD COLUMN "title" TEXT;

-- Backfill from the JSON already stored. `->>` yields NULL for a missing key,
-- and NULLIF collapses the empty strings some early rows carry, so anything
-- unusable stays NULL and the UI falls back rather than showing a blank title.
UPDATE "generated_cv"
SET "title" = COALESCE(
      NULLIF(btrim("data" ->> 'tagline'), ''),
      NULLIF(btrim("data" ->> 'fullName'), '')
    )
WHERE "title" IS NULL;
