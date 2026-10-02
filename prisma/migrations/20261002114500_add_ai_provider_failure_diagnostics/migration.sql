ALTER TABLE "ai_usage_event"
ADD COLUMN "providerFailureReason" TEXT,
ADD COLUMN "upstreamStatusCode" INTEGER,
ADD COLUMN "requestHeadroomTokens" INTEGER,
ADD COLUMN "requestOverflowTokens" INTEGER;
