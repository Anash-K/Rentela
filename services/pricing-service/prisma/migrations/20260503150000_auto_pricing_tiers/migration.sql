-- Auto-pricing versioned tiers + seed (matches product defaults)

DO $$ BEGIN
  CREATE TYPE "VehicleKind" AS ENUM ('BIKE', 'CAR', 'ERICKSHAW', 'TEMPO', 'LOADER');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE "AutoPricingRuleVersion" (
    "id" TEXT NOT NULL,
    "versionLabel" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "checksumSha256" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AutoPricingRuleVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AutoPricingRuleVersion_versionLabel_key" ON "AutoPricingRuleVersion"("versionLabel");

CREATE TABLE "AutoPricingTier" (
    "id" TEXT NOT NULL,
    "ruleVersionId" TEXT NOT NULL,
    "vehicleKind" "VehicleKind" NOT NULL,
    "segmentLabel" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "minEngineCc" INTEGER,
    "maxEngineCc" INTEGER,
    "capacityCeilingKg" INTEGER,
    "basePricePerDay" DECIMAL(12,2) NOT NULL,
    "includedKmPerDay" DECIMAL(10,2) NOT NULL,
    "extraKmPrice" DECIMAL(10,2) NOT NULL,
    "weekendMultiplier" DECIMAL(5,2) NOT NULL DEFAULT 1.20,
    "hourlyFromDailyDivisor" INTEGER NOT NULL DEFAULT 10,

    CONSTRAINT "AutoPricingTier_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AutoPricingTier_ruleVersionId_fkey" FOREIGN KEY ("ruleVersionId") REFERENCES "AutoPricingRuleVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "AutoPricingTier_ruleVersionId_vehicleKind_idx" ON "AutoPricingTier"("ruleVersionId", "vehicleKind");

-- Seed default rule set
INSERT INTO "AutoPricingRuleVersion" ("id", "versionLabel", "effectiveFrom", "isActive", "notes")
VALUES (
    'a0000000-0000-4000-8000-000000000001',
    '2026.05.default',
    CURRENT_TIMESTAMP,
    true,
    'Bootstrap tiers — adjust via admin / DB migration'
);

INSERT INTO "AutoPricingTier" ("id", "ruleVersionId", "vehicleKind", "segmentLabel", "sortOrder", "minEngineCc", "maxEngineCc", "capacityCeilingKg", "basePricePerDay", "includedKmPerDay", "extraKmPrice", "weekendMultiplier", "hourlyFromDailyDivisor")
VALUES
(gen_random_uuid(), 'a0000000-0000-4000-8000-000000000001', 'BIKE', 'ECONOMY', 0, 0, 125, NULL, 400, 80, 4, 1.20, 10),
(gen_random_uuid(), 'a0000000-0000-4000-8000-000000000001', 'BIKE', 'STANDARD', 1, 126, 250, NULL, 700, 100, 5, 1.20, 10),
(gen_random_uuid(), 'a0000000-0000-4000-8000-000000000001', 'BIKE', 'PREMIUM', 2, 251, 1000, NULL, 1200, 120, 7, 1.20, 10),
(gen_random_uuid(), 'a0000000-0000-4000-8000-000000000001', 'CAR', 'ECONOMY', 0, 0, 1200, NULL, 1200, 150, 8, 1.20, 10),
(gen_random_uuid(), 'a0000000-0000-4000-8000-000000000001', 'CAR', 'STANDARD', 1, 1201, 2000, NULL, 2000, 180, 10, 1.20, 10),
(gen_random_uuid(), 'a0000000-0000-4000-8000-000000000001', 'CAR', 'PREMIUM', 2, 2001, 5000, NULL, 3500, 200, 15, 1.20, 10),
(gen_random_uuid(), 'a0000000-0000-4000-8000-000000000001', 'ERICKSHAW', 'STANDARD', 0, NULL, NULL, NULL, 500, 80, 4, 1.20, 10),
(gen_random_uuid(), 'a0000000-0000-4000-8000-000000000001', 'TEMPO', 'CAP_500', 0, NULL, NULL, 500, 1500, 100, 12, 1.20, 10),
(gen_random_uuid(), 'a0000000-0000-4000-8000-000000000001', 'TEMPO', 'CAP_1000', 1, NULL, NULL, 1000, 2500, 120, 15, 1.20, 10),
(gen_random_uuid(), 'a0000000-0000-4000-8000-000000000001', 'LOADER', 'CAP_1000', 0, NULL, NULL, 1000, 2000, 120, 15, 1.20, 10),
(gen_random_uuid(), 'a0000000-0000-4000-8000-000000000001', 'LOADER', 'CAP_2000', 1, NULL, NULL, 2000, 3500, 150, 20, 1.20, 10);
