-- The first-line heuristic in the previous migration was wrong often enough to
-- matter: on real pasted JDs the first line is usually a section header
-- ("About the job", "Job description"), not the role. A header rendered as a
-- title is worse than a blank, because the UI can fall back gracefully from
-- NULL but has no way to know "About the job" is meaningless.
--
-- Clear those. Rows analysed from here on get their title from the matcher's
-- own extraction, which reads the whole JD rather than guessing from line one.
UPDATE "analysis"
SET "jobTitle" = NULL
WHERE "jobTitle" IS NOT NULL
  AND lower(btrim("jobTitle")) ~ '^(about( the)?( job| role| us| the company)?|job description|the role|role description|overview|summary|position|vacancy|description|introduction|who we are|what you.ll be doing)[[:punct:]]*$';
