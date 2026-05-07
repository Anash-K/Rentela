-- Vehicle onboarding pipeline (request → tracker provisioning → ops testing → activation)

-- 1) Enums (new + extend existing)
ALTER TYPE "VehicleStatus" ADD VALUE IF NOT EXISTS 'ONBOARDING';

DO $$ BEGIN
  CREATE TYPE "VehicleRequestStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "TrackerStatus" AS ENUM ('NONE', 'REQUESTED', 'ACKNOWLEDGED', 'INSTALLED', 'TESTING', 'TESTING_FAILED', 'ACTIVE', 'REPLACING');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ProvisioningStatus" AS ENUM ('REQUESTED', 'ACKNOWLEDGED', 'INSTALLED', 'FAILED', 'CANCELLED', 'REPLACED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "TelemetryTestStatus" AS ENUM ('PENDING', 'PASSED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Vehicle: new lifecycle columns
ALTER TABLE "Vehicle"
  ADD COLUMN IF NOT EXISTS "trackerStatus"         "TrackerStatus" NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS "deviceId"              TEXT,
  ADD COLUMN IF NOT EXISTS "currentProvisioningId" TEXT,
  ADD COLUMN IF NOT EXISTS "operationalReadyAt"    TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "onboardingRequestId"   TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Vehicle_onboardingRequestId_key" ON "Vehicle"("onboardingRequestId");
CREATE INDEX IF NOT EXISTS "Vehicle_status_idx" ON "Vehicle"("status");
CREATE INDEX IF NOT EXISTS "Vehicle_trackerStatus_idx" ON "Vehicle"("trackerStatus");

-- 3) VehicleRequest
CREATE TABLE IF NOT EXISTS "VehicleRequest" (
    "id"               TEXT NOT NULL,
    "vendorId"         TEXT,
    "branchId"         TEXT NOT NULL,
    "categoryId"       TEXT NOT NULL,

    "registrationNo"   TEXT NOT NULL,
    "brand"            TEXT NOT NULL,
    "model"            TEXT NOT NULL,
    "variant"          TEXT,

    "year"             INTEGER,
    "color"            TEXT,
    "seats"            INTEGER,

    "vehicleKind"      VARCHAR(16),
    "engineCC"         INTEGER,
    "loadCapacityKg"   INTEGER,

    "fuelType"         "FuelType" NOT NULL,
    "transmission"     "TransmissionType",

    "batteryCapacity"  DOUBLE PRECISION,
    "rangeKm"          DOUBLE PRECISION,

    "odoMeterKm"       DOUBLE PRECISION NOT NULL DEFAULT 0,

    "basePrice"        DECIMAL(10,2) NOT NULL,
    "securityDeposit"  DECIMAL(10,2),

    "documentRefs"     JSONB,

    "status"           "VehicleRequestStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "submittedBy"      TEXT,
    "reviewedBy"       TEXT,
    "reviewedAt"       TIMESTAMP(3),
    "rejectionReason"  TEXT,
    "notes"            TEXT,

    "vehicleId"        TEXT,

    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VehicleRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "VehicleRequest_vehicleId_key" ON "VehicleRequest"("vehicleId");
CREATE INDEX IF NOT EXISTS "VehicleRequest_status_idx" ON "VehicleRequest"("status");
CREATE INDEX IF NOT EXISTS "VehicleRequest_branchId_status_idx" ON "VehicleRequest"("branchId", "status");
CREATE INDEX IF NOT EXISTS "VehicleRequest_registrationNo_idx" ON "VehicleRequest"("registrationNo");

-- 4) DeviceProvisioning
CREATE TABLE IF NOT EXISTS "DeviceProvisioning" (
    "id"               TEXT NOT NULL,
    "vehicleId"        TEXT NOT NULL,

    "vendorName"       TEXT NOT NULL DEFAULT 'MAPMYINDIA',
    "vendorRequestId"  TEXT,

    "status"           "ProvisioningStatus" NOT NULL DEFAULT 'REQUESTED',
    "attemptNumber"    INTEGER NOT NULL DEFAULT 1,

    "deviceId"         TEXT,
    "imei"             TEXT,
    "simNumber"        TEXT,

    "requestPayload"   JSONB,
    "responsePayload"  JSONB,
    "webhookPayload"   JSONB,

    "failureReason"    TEXT,
    "requestedBy"      TEXT,

    "requestedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt"   TIMESTAMP(3),
    "installedAt"      TIMESTAMP(3),
    "failedAt"         TIMESTAMP(3),

    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeviceProvisioning_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DeviceProvisioning_vendorRequestId_key" ON "DeviceProvisioning"("vendorRequestId");
CREATE INDEX IF NOT EXISTS "DeviceProvisioning_vehicleId_status_idx" ON "DeviceProvisioning"("vehicleId", "status");
CREATE INDEX IF NOT EXISTS "DeviceProvisioning_status_requestedAt_idx" ON "DeviceProvisioning"("status", "requestedAt");

-- 5) VehicleTelemetryTest
CREATE TABLE IF NOT EXISTS "VehicleTelemetryTest" (
    "id"                 TEXT NOT NULL,
    "vehicleId"          TEXT NOT NULL,
    "provisioningId"     TEXT,

    "status"             "TelemetryTestStatus" NOT NULL DEFAULT 'PENDING',

    "gpsAccuracyOk"      BOOLEAN,
    "routeAccurate"      BOOLEAN,
    "distanceRealistic"  BOOLEAN,
    "speedCorrect"       BOOLEAN,
    "ignitionDetected"   BOOLEAN,
    "odometerOk"         BOOLEAN,
    "telemetryDelaySec"  INTEGER,

    "failureReasons"     TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "notes"              TEXT,

    "testedBy"           TEXT,
    "testedAt"           TIMESTAMP(3),
    "reviewedBy"         TEXT,
    "reviewedAt"         TIMESTAMP(3),

    "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"          TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VehicleTelemetryTest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "VehicleTelemetryTest_vehicleId_status_idx" ON "VehicleTelemetryTest"("vehicleId", "status");
CREATE INDEX IF NOT EXISTS "VehicleTelemetryTest_status_createdAt_idx" ON "VehicleTelemetryTest"("status", "createdAt");

-- 6) VendorWebhookEvent (idempotency ledger)
CREATE TABLE IF NOT EXISTS "VendorWebhookEvent" (
    "id"              TEXT NOT NULL,
    "vendor"          TEXT NOT NULL,
    "externalId"      TEXT NOT NULL,
    "status"          TEXT NOT NULL DEFAULT 'RECEIVED',
    "rejectionReason" TEXT,
    "payload"         JSONB,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "VendorWebhookEvent_vendor_externalId_key" ON "VendorWebhookEvent"("vendor", "externalId");
CREATE INDEX IF NOT EXISTS "VendorWebhookEvent_vendor_createdAt_idx" ON "VendorWebhookEvent"("vendor", "createdAt");

-- 7) Foreign keys
ALTER TABLE "VehicleRequest"
  ADD CONSTRAINT "VehicleRequest_vehicleId_fkey"
  FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DeviceProvisioning"
  ADD CONSTRAINT "DeviceProvisioning_vehicleId_fkey"
  FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "VehicleTelemetryTest"
  ADD CONSTRAINT "VehicleTelemetryTest_vehicleId_fkey"
  FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
