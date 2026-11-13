/** Exact Daml `Decimal` amounts as scaled BigInt (10 decimal places). Never goes through a float. */

export const DECIMAL_PLACES = 10;
const SCALE = 10n ** BigInt(DECIMAL_PLACES);
/** The largest Daml `Numeric 10` (10^28 - 10^-10), in units: 38 digits. */
export const MAX_DECIMAL_UNITS = 10n ** 38n - 1n;
const DECIMAL_PATTERN = /^(\d{1,28})(?:\.(\d{1,10}))?$/;

/** Units of 10^-10 in a non-negative decimal string, or null when it is not one (sign, exponent, >10 places, …). */
export function parseDecimalUnits(text: string): bigint | null {
  const match = DECIMAL_PATTERN.exec(text);
  if (!match) return null;
  const whole = match[1] ?? '0';
  const fraction = (match[2] ?? '').padEnd(DECIMAL_PLACES, '0');
  return BigInt(whole) * SCALE + BigInt(fraction);
}

/** Units as a decimal string with exactly 10 places, as the ledger prints Decimals (`40.0000000000`). */
export function formatDecimalUnits(units: bigint): string {
  if (units < 0n) throw new RangeError('Amounts are never negative');
  const whole = units / SCALE;
  const fraction = (units % SCALE).toString().padStart(DECIMAL_PLACES, '0');
  return `${whole.toString()}.${fraction}`;
}
