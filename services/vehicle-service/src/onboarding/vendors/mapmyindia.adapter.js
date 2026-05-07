/**
 * MapMyIndia (mock) tracker vendor adapter.
 *
 * Real adapter responsibilities (kept behind this interface):
 *   1. requestInstallation(vehicle, requestPayload) → { vendorRequestId, accepted, raw }
 *   2. cancel(vendorRequestId) for unwound flows
 *   3. webhook signature verification (left as TODO for real provider)
 *
 * Tests / local dev call `simulateInstall` to mimic the asynchronous vendor callback.
 */

import { randomUUID } from "node:crypto";

const SIMULATE_LATENCY_MS = Number(process.env.MAPMYINDIA_SIMULATE_LATENCY_MS ?? 0);

async function maybeDelay() {
  if (!SIMULATE_LATENCY_MS) return;
  await new Promise((r) => setTimeout(r, SIMULATE_LATENCY_MS));
}

export const mapMyIndiaAdapter = {
  vendorName: "MAPMYINDIA",

  /** Submit a provisioning request — return a vendorRequestId for webhook correlation. */
  async requestInstallation({ vehicle, attemptNumber, requestedBy }) {
    await maybeDelay();
    const vendorRequestId = `mmi_${randomUUID()}`;
    return {
      vendorRequestId,
      accepted: true,
      raw: {
        provider: "mapmyindia-mock",
        accepted: true,
        vehicleId: vehicle.id,
        registrationNo: vehicle.registrationNo,
        attemptNumber,
        requestedBy: requestedBy ?? null,
        receivedAt: new Date().toISOString(),
      },
    };
  },

  /** Cancel an in-flight provisioning request (best-effort). */
  async cancel(vendorRequestId) {
    await maybeDelay();
    return { cancelled: true, vendorRequestId };
  },

  /**
   * Verify webhook authenticity — production implementation would HMAC-check headers.
   * Local mock just rejects empty external IDs.
   */
  verifyWebhook({ externalId }) {
    if (!externalId || typeof externalId !== "string") {
      return { ok: false, reason: "MISSING_EXTERNAL_ID" };
    }
    return { ok: true };
  },
};

export const trackerVendor = mapMyIndiaAdapter;
