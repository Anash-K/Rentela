/**
 * Vehicle onboarding state machine — single source of truth for legal transitions.
 * Two orthogonal axes:
 *   - VehicleStatus  (booking-availability lifecycle)
 *   - TrackerStatus  (telematics readiness sub-pipeline)
 *
 * Transitions live here so services stay declarative and reviewers can audit them at a glance.
 */

import { throwError } from "../utils/commonResponse.js";

/** VehicleStatus → set of allowed next states (forward-only, no resurrection from terminals). */
const VEHICLE_STATUS_TRANSITIONS = {
  ONBOARDING: new Set([
    "ONBOARDING",
    "AVAILABLE",
    "INACTIVE",
    "RETIRED",
  ]),
  AVAILABLE: new Set([
    "BOOKED",
    "IN_USE",
    "UNDER_MAINTENANCE",
    "IN_TRANSIT",
    "INACTIVE",
    "RETIRED",
  ]),
  BOOKED: new Set(["AVAILABLE", "IN_USE", "INACTIVE"]),
  IN_USE: new Set(["AVAILABLE", "UNDER_MAINTENANCE", "INACTIVE"]),
  UNDER_MAINTENANCE: new Set(["AVAILABLE", "INACTIVE", "RETIRED"]),
  IN_TRANSIT: new Set(["AVAILABLE", "INACTIVE"]),
  INACTIVE: new Set(["AVAILABLE", "RETIRED"]),
  RETIRED: new Set(["RETIRED"]),
};

/** TrackerStatus → set of allowed next states. */
const TRACKER_STATUS_TRANSITIONS = {
  NONE: new Set(["NONE", "REQUESTED"]),
  REQUESTED: new Set(["ACKNOWLEDGED", "INSTALLED", "FAILED_REQUEST", "REQUESTED"]),
  ACKNOWLEDGED: new Set(["INSTALLED", "REQUESTED"]),
  INSTALLED: new Set(["TESTING", "ACTIVE", "TESTING_FAILED", "REPLACING"]),
  TESTING: new Set(["TESTING_FAILED", "ACTIVE", "INSTALLED"]),
  TESTING_FAILED: new Set(["TESTING", "REPLACING", "REQUESTED"]),
  ACTIVE: new Set(["REPLACING", "ACTIVE"]),
  REPLACING: new Set(["REQUESTED"]),
};

/**
 * Idempotent assertion: same-state moves are allowed (no-op friendly), illegal jumps throw 409.
 */
export function assertVehicleTransition(from, to) {
  if (from === to) return;
  const allowed = VEHICLE_STATUS_TRANSITIONS[from];
  if (!allowed) {
    throwError(`Unknown vehicle status: ${from}`, 500);
  }
  if (!allowed.has(to)) {
    throwError(`Illegal vehicle transition: ${from} → ${to}`, 409);
  }
}

export function assertTrackerTransition(from, to) {
  if (from === to) return;
  const allowed = TRACKER_STATUS_TRANSITIONS[from];
  if (!allowed) {
    throwError(`Unknown tracker status: ${from}`, 500);
  }
  if (!allowed.has(to)) {
    throwError(`Illegal tracker transition: ${from} → ${to}`, 409);
  }
}

/** Pre-flight check: vehicle is in ONBOARDING + telematics ready before going live. */
export function canActivateVehicle(vehicle) {
  return (
    vehicle.status === "ONBOARDING" &&
    (vehicle.trackerStatus === "INSTALLED" || vehicle.trackerStatus === "TESTING")
  );
}

export const VEHICLE_STATUS = {
  ONBOARDING: "ONBOARDING",
  AVAILABLE: "AVAILABLE",
  BOOKED: "BOOKED",
  IN_USE: "IN_USE",
  UNDER_MAINTENANCE: "UNDER_MAINTENANCE",
  IN_TRANSIT: "IN_TRANSIT",
  RETIRED: "RETIRED",
  INACTIVE: "INACTIVE",
};

export const TRACKER_STATUS = {
  NONE: "NONE",
  REQUESTED: "REQUESTED",
  ACKNOWLEDGED: "ACKNOWLEDGED",
  INSTALLED: "INSTALLED",
  TESTING: "TESTING",
  TESTING_FAILED: "TESTING_FAILED",
  ACTIVE: "ACTIVE",
  REPLACING: "REPLACING",
};

export const PROVISIONING_STATUS = {
  REQUESTED: "REQUESTED",
  ACKNOWLEDGED: "ACKNOWLEDGED",
  INSTALLED: "INSTALLED",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
  REPLACED: "REPLACED",
};
