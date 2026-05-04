-- CreateEnum
CREATE TYPE "TransmissionType" AS ENUM ('MANUAL', 'AUTOMATIC');

-- AlterTable
ALTER TABLE "Vehicle" ADD COLUMN     "transmission" "TransmissionType",
ADD COLUMN     "variant" TEXT;

-- CreateTable
CREATE TABLE "VehicleTelemetry" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "batteryPercent" DOUBLE PRECISION,
    "charging" BOOLEAN NOT NULL DEFAULT false,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "speedKm" DOUBLE PRECISION,
    "odoMeterKm" DOUBLE PRECISION,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VehicleTelemetry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VehicleTelemetry_vehicleId_key" ON "VehicleTelemetry"("vehicleId");

-- CreateIndex
CREATE INDEX "VehicleTelemetry_batteryPercent_idx" ON "VehicleTelemetry"("batteryPercent");

-- CreateIndex
CREATE INDEX "VehicleTelemetry_isOnline_idx" ON "VehicleTelemetry"("isOnline");

-- AddForeignKey
ALTER TABLE "VehicleTelemetry" ADD CONSTRAINT "VehicleTelemetry_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
