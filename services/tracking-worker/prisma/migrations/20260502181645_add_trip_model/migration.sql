-- CreateTable
CREATE TABLE "Trip" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endTime" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "distanceKm" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Trip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Trip_bookingId_isActive_idx" ON "Trip"("bookingId", "isActive");

-- CreateIndex
CREATE INDEX "Trip_vehicleId_isActive_idx" ON "Trip"("vehicleId", "isActive");

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "VehicleDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
