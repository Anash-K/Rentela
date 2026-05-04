-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "cancelledBy" TEXT,
ADD COLUMN     "couponCode" TEXT,
ADD COLUMN     "platformFee" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "pricingRuleId" TEXT,
ADD COLUMN     "serviceFee" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "taxAmount" DECIMAL(10,2) NOT NULL DEFAULT 0;
