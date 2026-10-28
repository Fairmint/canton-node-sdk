/**
 * A minimal exact decimal for the test simulator, on the SDK's scaled-`bigint` decimal helpers, with the few
 * `BigNumber`-style methods the simulator needs.
 */
import { formatDecimal, parseDecimal, type ScaledDecimal } from '../../../../src/da-registry/setup/decimal';

export class Amount {
  static readonly ZERO = new Amount(0n);

  private constructor(private readonly scaled: ScaledDecimal) {}

  static of(value: string | Amount): Amount {
    return value instanceof Amount ? value : new Amount(parseDecimal(value));
  }

  plus(other: string | Amount): Amount {
    return new Amount(this.scaled + Amount.of(other).scaled);
  }

  minus(other: string | Amount): Amount {
    return new Amount(this.scaled - Amount.of(other).scaled);
  }

  gt(other: string | Amount): boolean {
    return this.scaled > Amount.of(other).scaled;
  }

  lt(other: string | Amount): boolean {
    return this.scaled < Amount.of(other).scaled;
  }

  isPositive(): boolean {
    return this.scaled > 0n;
  }

  /** Plain notation without trailing zeros, or with exactly `digits` fractional digits (the ledger's encoding). */
  toFixed(digits?: number): string {
    const plain = formatDecimal(this.scaled);
    if (digits === undefined) return plain;
    const [whole = '0', fraction = ''] = plain.split('.');
    return digits === 0 ? whole : `${whole}.${fraction.padEnd(digits, '0')}`;
  }
}
