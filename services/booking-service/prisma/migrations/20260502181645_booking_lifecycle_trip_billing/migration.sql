-- AlterEnum
ALTER TYPE "BookingStatus" ADD VALUE 'OVERDUE';

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "actualEndTime" TIMESTAMP(3),
ADD COLUMN     "actualStartTime" TIMESTAMP(3),
ADD COLUMN     "dropTime" TIMESTAMP(3),
ADD COLUMN     "extraPerHour" DOUBLE PRECISION,
ADD COLUMN     "extraPerKm" DOUBLE PRECISION,
ADD COLUMN     "includedKm" DOUBLE PRECISION,
ADD COLUMN     "pickupTime" TIMESTAMP(3);
