/** @param {number} n */
export function roundMoney(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}
