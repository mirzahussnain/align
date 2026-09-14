/*
  Warnings:

  - You are about to drop the `capability_usage_event` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "UsageReservationStatus" AS ENUM ('RESERVED', 'COMMITTED', 'RELEASED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "CapabilityOperationStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED_RETRYABLE', 'FAILED_TERMINAL');

-- DropForeignKey
ALTER TABLE "capability_usage_event" DROP CONSTRAINT "capability_usage_event_userId_fkey";

-- DropTable
DROP TABLE "capability_usage_event";

-- CreateTable
CREATE TABLE "capability_reservation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "capability" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "status" "UsageReservationStatus" NOT NULL DEFAULT 'RESERVED',
    "operationStatus" "CapabilityOperationStatus" NOT NULL DEFAULT 'PENDING',
    "fingerprint" TEXT,
    "failureReason" TEXT,
    "resultRef" TEXT,
    "repairOfOperationId" TEXT,
    "reservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "committedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "capability_reservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "capability_reservation_userId_capability_period_status_idx" ON "capability_reservation"("userId", "capability", "period", "status");

-- CreateIndex
CREATE UNIQUE INDEX "capability_reservation_userId_capability_operationId_key" ON "capability_reservation"("userId", "capability", "operationId");

-- AddForeignKey
ALTER TABLE "capability_reservation" ADD CONSTRAINT "capability_reservation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
