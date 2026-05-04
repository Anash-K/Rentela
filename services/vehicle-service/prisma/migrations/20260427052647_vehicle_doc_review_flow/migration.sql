/*
  Warnings:

  - Added the required column `updatedAt` to the `VehicleDocument` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('UNDER_REVIEW', 'APPROVED', 'REJECTED', 'EXPIRED');

-- AlterTable
ALTER TABLE "VehicleDocument" ADD COLUMN     "documentNo" TEXT,
ADD COLUMN     "issueDate" TIMESTAMP(3),
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedBy" TEXT,
ADD COLUMN     "status" "VerificationStatus" NOT NULL DEFAULT 'UNDER_REVIEW',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "uploadedBy" TEXT;

-- CreateIndex
CREATE INDEX "VehicleDocument_vehicleId_idx" ON "VehicleDocument"("vehicleId");

-- CreateIndex
CREATE INDEX "VehicleDocument_status_idx" ON "VehicleDocument"("status");

-- CreateIndex
CREATE INDEX "VehicleDocument_expiryDate_idx" ON "VehicleDocument"("expiryDate");
