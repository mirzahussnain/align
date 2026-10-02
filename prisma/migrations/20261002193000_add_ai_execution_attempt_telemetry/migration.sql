ALTER TABLE "ai_usage_event"
ADD COLUMN "actualTotalTokens" INTEGER,
ADD COLUMN "providerCandidateNumber" INTEGER,
ADD COLUMN "providerAttemptNumber" INTEGER,
ADD COLUMN "retryNumber" INTEGER,
ADD COLUMN "backoffMs" INTEGER,
ADD COLUMN "outcome" TEXT,
ADD COLUMN "preflightOutcome" TEXT;
