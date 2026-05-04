import {
  PAYMENT_AMOUNT_TOLERANCE_MINOR,
  ZERO_DECIMAL_CURRENCIES,
} from "../config/env.js";

const ZERO_DECIMAL_SET = new Set(
  ZERO_DECIMAL_CURRENCIES.split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean),
);

/**
 * Smallest currency unit count from decimal string (e.g. "123.45" INR → 12345 paise).
 * Zero-decimal currencies (JPY, …) use the integer part as-is.
 */
export function decimalStringToMinorUnits(amountDecimalString, currency) {
  const cur = (currency || "INR").toUpperCase();
  const n = Number.parseFloat(String(amountDecimalString));
  if (!Number.isFinite(n)) return NaN;
  if (ZERO_DECIMAL_SET.has(cur)) {
    return Math.round(n);
  }
  return Math.round(n * 100);
}

/**
 * Compare provider-reported capture amount (already in minor units) with our Payment row.
 */
export function verifyCapturedAgainstPayment(payment, verifiedAmountMinor, verifiedCurrency) {
  const cur = (verifiedCurrency || "").toUpperCase();
  const storedCur = (payment.currency || "INR").toUpperCase();
  if (cur !== storedCur) {
    return {
      ok: false,
      reason: "CURRENCY_MISMATCH",
      detail: { stored: storedCur, webhook: cur },
    };
  }

  const expected = decimalStringToMinorUnits(payment.amount.toString(), payment.currency);
  if (!Number.isFinite(expected) || !Number.isFinite(verifiedAmountMinor)) {
    return { ok: false, reason: "INVALID_AMOUNT_ENCODING", detail: {} };
  }

  const tol = Number.isFinite(PAYMENT_AMOUNT_TOLERANCE_MINOR)
    ? PAYMENT_AMOUNT_TOLERANCE_MINOR
    : 0;

  if (Math.abs(expected - verifiedAmountMinor) <= tol) {
    return { ok: true };
  }

  return {
    ok: false,
    reason: "AMOUNT_MISMATCH",
    detail: { expectedMinor: expected, actualMinor: verifiedAmountMinor, toleranceMinor: tol },
  };
}
