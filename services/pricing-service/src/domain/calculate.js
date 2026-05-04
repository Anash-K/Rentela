import { roundMoney } from "./money.js";

const MS_DAY = 1000 * 60 * 60 * 24;

function isWeekendUtc(date) {
  const d = date.getUTCDay();
  return d === 0 || d === 6;
}

/**
 * Rental day count: ceil calendar span, minimum 1 day.
 */
export function countRentalDays(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    const err = new Error("Invalid rental window");
    err.code = "QUOTE_BAD_WINDOW";
    throw err;
  }
  const raw = Math.ceil((end.getTime() - start.getTime()) / MS_DAY);
  return Math.max(1, raw);
}

/**
 * Per-day base sum with weekend multiplier applied per calendar day (UTC).
 */
export function sumDailyBaseRates(startDate, endDate, basePricePerDay, weekendMultiplier) {
  const days = countRentalDays(startDate, endDate);
  let basePrice = 0;
  const daily = Number(basePricePerDay);
  const mult = Number(weekendMultiplier);

  for (let i = 0; i < days; i++) {
    const date = new Date(startDate);
    date.setUTCDate(date.getUTCDate() + i);
    const isW = isWeekendUtc(date);
    const dayPrice = isW ? daily * mult : daily;
    basePrice += dayPrice;
  }
  return roundMoney(basePrice);
}

/**
 * @param {{ startDate: Date|string; endDate: Date|string; totalKm: number; pricing: {
 *   basePricePerDay: number; baseKmPerDay: number; pricePerExtraKm: number; weekendMultiplier: number;
 * }}} input
 */
export function calculateBookingPrice({ startDate, endDate, totalKm, pricing }) {
  const days = countRentalDays(startDate, endDate);
  const basePrice = sumDailyBaseRates(
    startDate,
    endDate,
    pricing.basePricePerDay,
    pricing.weekendMultiplier,
  );

  const includedKmPerDay = Number(pricing.baseKmPerDay);
  const allowedKm = includedKmPerDay * days;
  const extraKm = Math.max(0, Number(totalKm) - allowedKm);
  const extraKmCost = roundMoney(extraKm * Number(pricing.pricePerExtraKm));

  return {
    days,
    allowedKm,
    extraKm,
    basePrice,
    extraKmCost,
    total: roundMoney(basePrice + extraKmCost),
  };
}

export function calculateLateFee({ expectedEnd, actualEnd, hourlyPrice }) {
  const exp = new Date(expectedEnd);
  const act = new Date(actualEnd);
  if (Number.isNaN(exp.getTime()) || Number.isNaN(act.getTime())) return 0;
  const diffMs = act.getTime() - exp.getTime();
  if (diffMs <= 0) return 0;
  const diffHours = Math.ceil(diffMs / (1000 * 60 * 60));
  return roundMoney(diffHours * Number(hourlyPrice));
}

/**
 * Final bill from booked pricing snapshot + actuals (never re-query tier rules).
 */
export function generateFinalBill({ pricing, bookingWindow, actualKm, actualEnd }) {
  const base = calculateBookingPrice({
    startDate: bookingWindow.start,
    endDate: bookingWindow.end,
    totalKm: actualKm,
    pricing,
  });

  const lateFee = calculateLateFee({
    expectedEnd: bookingWindow.end,
    actualEnd,
    hourlyPrice: pricing.hourlyPrice,
  });

  return {
    basePrice: base.basePrice,
    extraKmCost: base.extraKmCost,
    lateFee,
    total: roundMoney(base.total + lateFee),
    breakdown: {
      days: base.days,
      allowedKm: base.allowedKm,
      extraKm: base.extraKm,
    },
  };
}
