-- CreateEnum
CREATE TYPE "BillingProvider" AS ENUM ('STRIPE', 'MANUAL');

-- CreateEnum
CREATE TYPE "BillingArrangement" AS ENUM ('RECURRING', 'FIXED_TERM', 'ONE_TIME', 'MANUAL');

-- CreateEnum
CREATE TYPE "BillingPurchaseStatus" AS ENUM ('PENDING', 'TRIALING', 'ACTIVE', 'PAST_DUE', 'UNPAID', 'CANCELLED', 'EXPIRED', 'REFUNDED', 'INCOMPLETE', 'INCOMPLETE_EXPIRED');

-- CreateTable
CREATE TABLE "billing_account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_purchase" (
    "id" TEXT NOT NULL,
    "billingAccountId" TEXT NOT NULL,
    "provider" "BillingProvider" NOT NULL,
    "arrangement" "BillingArrangement" NOT NULL,
    "offerId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" "BillingPurchaseStatus" NOT NULL,
    "providerCustomerId" TEXT,
    "providerPurchaseId" TEXT,
    "providerSubscriptionId" TEXT,
    "providerPriceId" TEXT,
    "accessStartsAt" TIMESTAMP(3),
    "accessEndsAt" TIMESTAMP(3),
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "trialEndsAt" TIMESTAMP(3),
    "graceEndsAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "expiredAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_purchase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "billing_account_userId_key" ON "billing_account"("userId");

-- CreateIndex
CREATE INDEX "billing_purchase_billingAccountId_status_idx" ON "billing_purchase"("billingAccountId", "status");

-- CreateIndex
CREATE INDEX "billing_purchase_planId_status_idx" ON "billing_purchase"("planId", "status");

-- CreateIndex
CREATE INDEX "billing_purchase_accessEndsAt_idx" ON "billing_purchase"("accessEndsAt");

-- CreateIndex
CREATE UNIQUE INDEX "billing_purchase_provider_providerPurchaseId_key" ON "billing_purchase"("provider", "providerPurchaseId");

-- CreateIndex
CREATE UNIQUE INDEX "billing_purchase_provider_providerSubscriptionId_key" ON "billing_purchase"("provider", "providerSubscriptionId");

-- AddForeignKey
ALTER TABLE "billing_account" ADD CONSTRAINT "billing_account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billing_purchase" ADD CONSTRAINT "billing_purchase_billingAccountId_fkey" FOREIGN KEY ("billingAccountId") REFERENCES "billing_account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
