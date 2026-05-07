/**
 * Ops field-test reports for telematics validation.
 *
 * Lifecycle:
 *   1. submitTelemetryTest() — creates a row capturing on-the-ground checks; auto-derives PASSED/FAILED.
 *   2. reviewTelemetryTest() — branch admin sign-off (audit hook before activation).
 *
 * Vehicle.trackerStatus is updated alongside:
 *   PASSED → TESTING (waiting for admin activate)
 *   FAILED → TESTING_FAILED (retry path)
 */

import prisma from "../libs/prisma.js";
import { throwError } from "../utils/commonResponse.js";
import { ONBOARDING_EVENTS, emit } from "./events.js";
import { TRACKER_STATUS, VEHICLE_STATUS } from "./state-machine.js";

/** Boolean flags that must all be true for a passing test (any false = FAILED). */
const REQUIRED_PASS_FLAGS = [
  "gpsAccuracyOk",
  "routeAccurate",
  "distanceRealistic",
  "speedCorrect",
  "ignitionDetected",
  "odometerOk",
];

const MAX_ALLOWED_DELAY_SEC = Number(process.env.TELEMETRY_TEST_MAX_DELAY_SEC ?? 30);

function deriveOutcome(checks, telemetryDelaySec) {
  const failureReasons = [];

  for (const flag of REQUIRED_PASS_FLAGS) {
    if (checks[flag] === false) {
      failureReasons.push(`${flag}=false`);
    } else if (checks[flag] === undefined || checks[flag] === null) {
      failureReasons.push(`${flag} missing`);
    }
  }

  if (
    typeof telemetryDelaySec === "number" &&
    Number.isFinite(telemetryDelaySec) &&
    telemetryDelaySec > MAX_ALLOWED_DELAY_SEC
  ) {
    failureReasons.push(`telemetryDelaySec ${telemetryDelaySec}s > ${MAX_ALLOWED_DELAY_SEC}s`);
  }

  return {
    status: failureReasons.length === 0 ? "PASSED" : "FAILED",
    failureReasons,
  };
}

export async function submitTelemetryTest(vehicleId, body, testedBy) {
  const vehicle = await prisma.vehicle.findUnique({ where: { id: vehicleId } });
  if (!vehicle) throwError("Vehicle not found", 404);
  if (vehicle.status !== VEHICLE_STATUS.ONBOARDING) {
    throwError("Telemetry tests are only allowed during ONBOARDING", 409);
  }
  if (
    vehicle.trackerStatus !== TRACKER_STATUS.INSTALLED &&
    vehicle.trackerStatus !== TRACKER_STATUS.TESTING &&
    vehicle.trackerStatus !== TRACKER_STATUS.TESTING_FAILED
  ) {
    throwError(
      `Tracker must be INSTALLED before testing — current ${vehicle.trackerStatus}`,
      409,
    );
  }

  const provisioning = await prisma.deviceProvisioning.findFirst({
    where: { vehicleId, status: "INSTALLED" },
    orderBy: { installedAt: "desc" },
  });

  const checks = {
    gpsAccuracyOk: body.gpsAccuracyOk ?? null,
    routeAccurate: body.routeAccurate ?? null,
    distanceRealistic: body.distanceRealistic ?? null,
    speedCorrect: body.speedCorrect ?? null,
    ignitionDetected: body.ignitionDetected ?? null,
    odometerOk: body.odometerOk ?? null,
  };

  const { status, failureReasons } = deriveOutcome(checks, body.telemetryDelaySec);
  const extraReasons = Array.isArray(body.failureReasons) ? body.failureReasons : [];
  const mergedReasons = [...new Set([...failureReasons, ...extraReasons])];

  const test = await prisma.$transaction(async (tx) => {
    const row = await tx.vehicleTelemetryTest.create({
      data: {
        vehicleId,
        provisioningId: provisioning?.id ?? null,
        status,
        ...checks,
        telemetryDelaySec: body.telemetryDelaySec ?? null,
        failureReasons: mergedReasons,
        notes: body.notes ?? null,
        testedBy: testedBy ?? null,
        testedAt: new Date(),
      },
    });
    await tx.vehicle.update({
      where: { id: vehicleId },
      data: {
        trackerStatus:
          status === "PASSED" ? TRACKER_STATUS.TESTING : TRACKER_STATUS.TESTING_FAILED,
      },
    });
    return row;
  });

  await emit(ONBOARDING_EVENTS.TELEMETRY_TEST_SUBMITTED, {
    vehicleId,
    testId: test.id,
    status: test.status,
    failureReasons: test.failureReasons,
  });

  if (test.status === "PASSED") {
    await emit(ONBOARDING_EVENTS.TELEMETRY_TEST_PASSED, {
      vehicleId,
      testId: test.id,
    });
  } else {
    await emit(ONBOARDING_EVENTS.TELEMETRY_TEST_FAILED, {
      vehicleId,
      testId: test.id,
      reasons: test.failureReasons,
    });
  }

  return test;
}

export async function reviewTelemetryTest(testId, { reviewedBy } = {}) {
  const test = await prisma.vehicleTelemetryTest.findUnique({ where: { id: testId } });
  if (!test) throwError("Test not found", 404);
  if (test.reviewedAt) return test;
  return prisma.vehicleTelemetryTest.update({
    where: { id: testId },
    data: { reviewedBy: reviewedBy ?? null, reviewedAt: new Date() },
  });
}

export async function listTelemetryTests(vehicleId) {
  return prisma.vehicleTelemetryTest.findMany({
    where: { vehicleId },
    orderBy: { createdAt: "desc" },
  });
}
