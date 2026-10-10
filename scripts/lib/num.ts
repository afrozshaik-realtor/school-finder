/**
 * Strict numeric parse for CSV cells: `Number("")` is `0` in JavaScript,
 * which turns a blank cell into a real, wrong coordinate/sequence
 * instead of "missing" -- exactly the class of bug this app's rules
 * forbid (never substitute a guess for absent data). This returns NaN
 * for blank/undefined input so `Number.isFinite()` checks downstream
 * correctly reject it.
 */
export function toFiniteNumber(value: string | undefined): number {
  if (value === undefined || value.trim() === "") return NaN;
  return Number(value);
}
