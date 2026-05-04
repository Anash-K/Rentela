/**
 * @param {{ vehicleKind: string; engineCC?: number | null; loadCapacityKg?: number | null }} vehicle
 * @param {AutoPricingTier[]} tiersOfKind — pre-filtered same vehicleKind, sorted (tempo/loader by capacity asc)
 */
export function classifyVehicle(vehicle, tiersOfKind) {
  const kind = vehicle.vehicleKind?.toUpperCase?.();
  if (!kind) {
    const err = new Error("vehicleKind is required");
    err.code = "CLASSIFY_MISSING_KIND";
    throw err;
  }

  if (kind === "BIKE" || kind === "CAR") {
    const cc =
      vehicle.engineCC != null && Number.isFinite(Number(vehicle.engineCC))
        ? Number(vehicle.engineCC)
        : null;
    if (cc == null) {
      const err = new Error(`engineCC required for ${kind}`);
      err.code = "CLASSIFY_MISSING_CC";
      throw err;
    }
    const rule = tiersOfKind.find(
      (r) =>
        r.minEngineCc != null &&
        r.maxEngineCc != null &&
        cc >= Number(r.minEngineCc) &&
        cc <= Number(r.maxEngineCc),
    );
    if (!rule) {
      const err = new Error(`No pricing tier for ${kind} engineCC=${cc}`);
      err.code = "CLASSIFY_NO_CC_MATCH";
      throw err;
    }
    return rule;
  }

  if (kind === "TEMPO" || kind === "LOADER") {
    const load =
      vehicle.loadCapacityKg != null && Number.isFinite(Number(vehicle.loadCapacityKg))
        ? Number(vehicle.loadCapacityKg)
        : null;
    if (load == null || load < 0) {
      const err = new Error(`loadCapacityKg required for ${kind}`);
      err.code = "CLASSIFY_MISSING_CAPACITY";
      throw err;
    }
    /** Ascending by capacity ceiling — pick smallest ceiling that fits */
    const sorted = [...tiersOfKind].sort(
      (a, b) => Number(a.capacityCeilingKg ?? 0) - Number(b.capacityCeilingKg ?? 0),
    );
    const rule = sorted.find((r) => r.capacityCeilingKg != null && load <= Number(r.capacityCeilingKg));
    if (!rule) {
      const err = new Error(`No pricing tier for ${kind} loadCapacityKg=${load}`);
      err.code = "CLASSIFY_NO_CAPACITY_MATCH";
      throw err;
    }
    return rule;
  }

  if (kind === "ERICKSHAW") {
    const rule = tiersOfKind[0];
    if (!rule) {
      const err = new Error("No ERICKSHAW tier configured");
      err.code = "CLASSIFY_NO_ERICKSHAW";
      throw err;
    }
    return rule;
  }

  const err = new Error(`Unsupported vehicle kind: ${kind}`);
  err.code = "CLASSIFY_UNSUPPORTED_KIND";
  throw err;
}
