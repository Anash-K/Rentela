-- CreateEnum
CREATE TYPE "MetricPeriod" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

-- CreateTable
CREATE TABLE "RevenueMetric" (
    "id" TEXT NOT NULL,
    "period" "MetricPeriod" NOT NULL,
    "metricDate" TIMESTAMP(3) NOT NULL,
    "branchId" TEXT,
    "totalRevenue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalRefunds" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "netRevenue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalBookings" INTEGER NOT NULL DEFAULT 0,
    "completedBookings" INTEGER NOT NULL DEFAULT 0,
    "cancelledBookings" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RevenueMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FleetMetric" (
    "id" TEXT NOT NULL,
    "period" "MetricPeriod" NOT NULL,
    "metricDate" TIMESTAMP(3) NOT NULL,
    "branchId" TEXT,
    "totalVehicles" INTEGER NOT NULL DEFAULT 0,
    "availableVehicles" INTEGER NOT NULL DEFAULT 0,
    "bookedVehicles" INTEGER NOT NULL DEFAULT 0,
    "utilizationPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FleetMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerMetric" (
    "id" TEXT NOT NULL,
    "period" "MetricPeriod" NOT NULL,
    "metricDate" TIMESTAMP(3) NOT NULL,
    "newUsers" INTEGER NOT NULL DEFAULT 0,
    "activeUsers" INTEGER NOT NULL DEFAULT 0,
    "repeatUsers" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerMetric_pkey" PRIMARY KEY ("id")
);
