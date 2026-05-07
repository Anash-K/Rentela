/** Money comparison tolerance (paise / cents). */
export const MONEY_EPS = 0.005;

export function parseSettlementMode(value) {
  const allowed = new Set(["PAY_AT_BOOKING", "PAY_AFTER_TRIP", "DEPOSIT_AND_SETTLE"]);
  if (typeof value === "string" && allowed.has(value)) return value;
  return "DEPOSIT_AND_SETTLE";
}

export function parsePaymentPhase(raw) {
  const allowed = new Set(["PREPAY", "SETTLEMENT", "EXTENSION", "LEGACY"]);
  if (typeof raw === "string" && allowed.has(raw)) return raw;
  return "SETTLEMENT";
}
