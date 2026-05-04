-- AlterTable
ALTER TABLE "PricingRule" ADD COLUMN     "platformFeeFlat" DECIMAL(10,2),
ADD COLUMN     "platformFeePct" DECIMAL(5,2),
ADD COLUMN     "serviceFeeFlat" DECIMAL(10,2),
ADD COLUMN     "serviceFeePct" DECIMAL(5,2);
