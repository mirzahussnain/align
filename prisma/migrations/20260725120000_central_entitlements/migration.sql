CREATE TABLE "capability_usage_event" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "capability" TEXT NOT NULL,
  "period" TEXT NOT NULL,
  "operationId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "capability_usage_event_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "capability_usage_event_userId_capability_operationId_key"
  ON "capability_usage_event"("userId", "capability", "operationId");
CREATE INDEX "capability_usage_event_userId_capability_period_idx"
  ON "capability_usage_event"("userId", "capability", "period");
ALTER TABLE "capability_usage_event"
  ADD CONSTRAINT "capability_usage_event_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
