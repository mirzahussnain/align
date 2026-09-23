-- CreateTable
CREATE TABLE "ai_usage_event" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "operationId" TEXT,
    "capability" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "latencyMs" INTEGER NOT NULL,
    "success" BOOLEAN NOT NULL,
    "errorCode" TEXT,
    "fallbackUsed" BOOLEAN NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "estimatedCostUsd" DECIMAL(12,8),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_usage_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_usage_event_createdAt_idx" ON "ai_usage_event"("createdAt");

-- CreateIndex
CREATE INDEX "ai_usage_event_capability_createdAt_idx" ON "ai_usage_event"("capability", "createdAt");

-- CreateIndex
CREATE INDEX "ai_usage_event_userId_createdAt_idx" ON "ai_usage_event"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ai_usage_event_operationId_idx" ON "ai_usage_event"("operationId");

-- AddForeignKey
ALTER TABLE "ai_usage_event" ADD CONSTRAINT "ai_usage_event_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
