-- The preceding migration used unquoted camelCase identifiers. PostgreSQL
-- folds those names to lowercase, while Prisma emits quoted camelCase names.
-- Rename in a follow-up migration so databases that already applied the first
-- migration are repaired without rewriting migration history.
ALTER TABLE "ai_usage_event"
RENAME COLUMN estimatedinputtokens TO "estimatedInputTokens";

ALTER TABLE "ai_usage_event"
RENAME COLUMN maxoutputtokens TO "maxOutputTokens";

ALTER TABLE "ai_usage_event"
RENAME COLUMN estimatedrequesttokens TO "estimatedRequestTokens";

ALTER TABLE "ai_usage_event"
RENAME COLUMN requestbudgettokens TO "requestBudgetTokens";

ALTER TABLE "ai_usage_event"
RENAME COLUMN safetymargintokens TO "safetyMarginTokens";
