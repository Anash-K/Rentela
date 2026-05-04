-- CreateTable
CREATE TABLE "SearchIndex" (
    "id" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "branchName" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "categoryName" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "fuelType" TEXT NOT NULL,
    "seats" INTEGER,
    "pricePerHour" DECIMAL(10,2),
    "pricePerDay" DECIMAL(10,2),
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "searchableText" TEXT NOT NULL,
    "bookingCount" INTEGER NOT NULL DEFAULT 0,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "ratingAvg" DOUBLE PRECISION,
    "priorityScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchIndex_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SearchIndex_vehicleId_key" ON "SearchIndex"("vehicleId");

-- CreateIndex
CREATE INDEX "SearchIndex_branchId_idx" ON "SearchIndex"("branchId");

-- CreateIndex
CREATE INDEX "SearchIndex_city_idx" ON "SearchIndex"("city");

-- CreateIndex
CREATE INDEX "SearchIndex_categoryName_idx" ON "SearchIndex"("categoryName");

-- CreateIndex
CREATE INDEX "SearchIndex_fuelType_idx" ON "SearchIndex"("fuelType");

-- CreateIndex
CREATE INDEX "SearchIndex_isAvailable_idx" ON "SearchIndex"("isAvailable");

-- CreateIndex
CREATE INDEX "SearchIndex_pricePerHour_idx" ON "SearchIndex"("pricePerHour");
