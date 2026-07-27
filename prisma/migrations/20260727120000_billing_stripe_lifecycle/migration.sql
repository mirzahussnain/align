-- Billing Programme Stage 2: Stripe lifecycle schema.
-- Adds the account customer binding, the stale-event guard column, and the
-- webhook idempotency ledger; removes the deprecated legacy plan-authority column
-- (subscriptionTier) now that provider-neutral purchases are the sole authority.

-- AlterTable
ALTER TABLE "billing_account" ADD COLUMN     "provider" "BillingProvider",
ADD COLUMN     "providerCustomerId" TEXT;

-- AlterTable
ALTER TABLE "billing_purchase" ADD COLUMN     "lastEventAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "user" DROP COLUMN "subscriptionTier";

-- CreateTable
CREATE TABLE "billing_event_receipt" (
    "id" TEXT NOT NULL,
    "provider" "BillingProvider" NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "outcome" TEXT NOT NULL,
    "purchaseId" TEXT,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_event_receipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "billing_event_receipt_purchaseId_idx" ON "billing_event_receipt"("purchaseId");

-- CreateIndex
CREATE INDEX "billing_event_receipt_processedAt_idx" ON "billing_event_receipt"("processedAt");

-- CreateIndex
CREATE UNIQUE INDEX "billing_event_receipt_provider_providerEventId_key" ON "billing_event_receipt"("provider", "providerEventId");

-- CreateIndex
CREATE INDEX "billing_account_provider_providerCustomerId_idx" ON "billing_account"("provider", "providerCustomerId");
