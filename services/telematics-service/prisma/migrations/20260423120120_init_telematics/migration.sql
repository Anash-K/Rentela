-- CreateEnum
CREATE TYPE "DeviceStatus" AS ENUM ('ONLINE', 'OFFLINE', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('LOW_BATTERY', 'GEOFENCE_EXIT', 'OVERSPEED', 'DEVICE_OFFLINE', 'TAMPER_ALERT');

-- CreateTable
CREATE TABLE "VehicleDevice" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "imei" TEXT NOT NULL,
    "simNumber" TEXT,
    "firmwareVersion" TEXT,
    "status" "DeviceStatus" NOT NULL DEFAULT 'ONLINE',
    "installedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VehicleDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelemetryLog" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "speedKmph" DOUBLE PRECISION,
    "batteryPercent" DOUBLE PRECISION,
    "odometerKm" DOUBLE PRECISION,
    "ignitionOn" BOOLEAN,
    "charging" BOOLEAN,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelemetryLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "type" "AlertType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT,
    "isResolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VehicleDevice_vehicleId_key" ON "VehicleDevice"("vehicleId");

-- CreateIndex
CREATE UNIQUE INDEX "VehicleDevice_imei_key" ON "VehicleDevice"("imei");

-- AddForeignKey
ALTER TABLE "TelemetryLog" ADD CONSTRAINT "TelemetryLog_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "VehicleDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "VehicleDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
