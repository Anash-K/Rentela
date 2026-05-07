/**
 * Centralized event publisher for onboarding lifecycle.
 * RabbitMQ failures must NEVER break the request — best-effort fan-out.
 */

import { publishEvent } from "../libs/rabbitmq.js";

async function safePublish(routingKey, payload) {
  try {
    await publishEvent(routingKey, {
      ...payload,
      emittedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.warn(
      `[onboarding-events] Failed to publish ${routingKey}: ${err?.message ?? err}`,
    );
  }
}

export const ONBOARDING_EVENTS = {
  REQUEST_SUBMITTED: "vehicle.request.submitted",
  REQUEST_APPROVED: "vehicle.request.approved",
  REQUEST_REJECTED: "vehicle.request.rejected",
  REQUEST_CANCELLED: "vehicle.request.cancelled",
  PROVISIONING_REQUESTED: "vehicle.provisioning.requested",
  PROVISIONING_INSTALLED: "vehicle.provisioning.installed",
  PROVISIONING_FAILED: "vehicle.provisioning.failed",
  PROVISIONING_REPLACED: "vehicle.provisioning.replaced",
  TELEMETRY_TEST_SUBMITTED: "vehicle.telemetry.test.submitted",
  TELEMETRY_TEST_FAILED: "vehicle.telemetry.test.failed",
  TELEMETRY_TEST_PASSED: "vehicle.telemetry.test.passed",
  ACTIVATED: "vehicle.activated",
  DEACTIVATED: "vehicle.deactivated",
};

export function emit(eventKey, payload) {
  return safePublish(eventKey, payload);
}
