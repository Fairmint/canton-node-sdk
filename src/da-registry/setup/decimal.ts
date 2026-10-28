/**
 * Exact decimal arithmetic for registry amounts (Daml `Decimal`, 10 fractional digits), on scaled `bigint`s so sums and
 * deficits never lose precision.
 */

const SCALE = 10;
const FACTOR = 10n ** BigInt(SCALE);
const DECIMAL_PATTERN = /^([+-]?)(\d+)(?:\.(\d+))?$/;

/** Drops trailing `0`s with a scan, not a regex, so input with long runs of zeros stays linear. */
function trimTrailingZeros(digits: string): string {
  let end = digits.length;
  while (end > 0 && digits[end - 1] === '0') end--;
  return digits.slice(0, end);
}

/** An amount scaled by 10^10. */
export type ScaledDecimal = bigint;

/** Parses a decimal string (as the ledger and configs encode amounts); throws on anything else or on lost precision. */
export function parseDecimal(value: string): ScaledDecimal {
  const match = DECIMAL_PATTERN.exec(value.trim());
  if (!match) throw new Error(`not a decimal: ${JSON.stringify(value)}`);
  const [, sign = '', whole = '0', fraction = ''] = match;
  const significant = trimTrailingZeros(fraction);
  if (significant.length > SCALE) throw new Error(`more than ${SCALE} decimal places: ${value}`);
  const scaled = BigInt(whole) * FACTOR + BigInt(significant.padEnd(SCALE, '0'));
  return sign === '-' ? -scaled : scaled;
}

/** Plain notation with no trailing zeros: `10.50` → `10.5`, `1000.0000000000` → `1000`. */
export function formatDecimal(value: ScaledDecimal): string {
  const negative = value < 0n;
  const magnitude = negative ? -value : value;
  const whole = (magnitude / FACTOR).toString();
  const fraction = trimTrailingZeros((magnitude % FACTOR).toString().padStart(SCALE, '0'));
  return `${negative ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`;
}

export function sumDecimals(values: readonly ScaledDecimal[]): ScaledDecimal {
  return values.reduce((total, v) => total + v, 0n);
}
