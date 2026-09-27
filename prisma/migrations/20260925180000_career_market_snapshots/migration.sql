CREATE TABLE "career_market_snapshot" (
    "id" TEXT NOT NULL,
    "marketKey" TEXT NOT NULL,
    "roleQuery" TEXT NOT NULL,
    "locationQuery" TEXT NOT NULL,
    "normalizedRole" TEXT NOT NULL,
    "normalizedLocation" TEXT NOT NULL,
    "providerCoverage" JSONB NOT NULL,
    "sampleSize" INTEGER NOT NULL,
    "samplingStartedAt" TIMESTAMP(3) NOT NULL,
    "samplingCompletedAt" TIMESTAMP(3) NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "calculationVersion" TEXT NOT NULL,
    "salaryDisclosedCount" INTEGER NOT NULL,
    "salaryEligibleCount" INTEGER NOT NULL,
    "dataQuality" JSONB NOT NULL,
    "metrics" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "career_market_snapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "career_market_snapshot_marketKey_generatedAt_idx" ON "career_market_snapshot"("marketKey", "generatedAt" DESC);
CREATE INDEX "career_market_snapshot_expiresAt_idx" ON "career_market_snapshot"("expiresAt");
