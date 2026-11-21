/**
 * The CIP-56 token standard `HoldingV1` interface view (`Splice.Api.Token.HoldingV1:HoldingView`), read from untrusted
 * JSON as the Ledger JSON API v2 returns it in a created event's `interfaceViews`. Browser-safe: it imports nothing but
 * this module's own JSON guards, so the wallet layer and the Node-side `utils/token-standard/v1/holdings` share it.
 *
 * A view says what a contract claims about itself; it proves nothing. Trust comes from who signed the contract (see
 * `parseHolding` in `./holdings`).
 */
import { readInstrumentId } from './instrument';
import { isRecord, nonEmptyString } from './json';
import { qualifiedName } from './templates';
import type { ActiveContract, InstrumentId, InterfaceView } from './types';
import { TOKEN_STANDARD_V1_HOLDING_INTERFACE_ID } from '../utils/token-standard/v1/constants';

/** The `HoldingV1` interface id in package-name form, as an ACS read filters on it. */
export const HOLDING_V1_INTERFACE_ID = TOKEN_STANDARD_V1_HOLDING_INTERFACE_ID;

/** `HoldingV1.Lock`: who holds the lock and until when. */
export interface HoldingViewLock {
  readonly holders: readonly string[];
  /** ISO 8601, or null when the lock has no absolute expiry. */
  readonly expiresAt: string | null;
  /** Duration from the holding's createdAt ledger time after which the lock expires. */
  readonly expiresAfter: { readonly microseconds: string } | null;
  readonly context: string | null;
}

/** `MetadataV1.Metadata`: string values by key. */
export interface HoldingViewMetadata {
  readonly values: Readonly<Record<string, string>>;
}

/** A `HoldingV1.HoldingView`, its fields checked for shape only. */
export interface HoldingView {
  readonly owner: string;
  readonly instrumentId: InstrumentId;
  /** Decimal string as the view reports it (not yet checked as a decimal). */
  readonly amount: string;
  /** Null when the holding is unlocked. */
  readonly lock: HoldingViewLock | null;
  readonly meta: HoldingViewMetadata;
}

const ISO_8601_TIMESTAMP_PATTERN =
  /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;
const SIGNED_INTEGER_PATTERN = /^-?\d+$/;

/** An ISO 8601 ledger timestamp of a real calendar day, or undefined. */
export function readLedgerTimestamp(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const match = ISO_8601_TIMESTAMP_PATTERN.exec(value);
  if (!match || Number.isNaN(Date.parse(value))) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const isLeapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = month === 2 ? (isLeapYear ? 29 : 28) : [4, 6, 9, 11].includes(month) ? 30 : 31;
  return day <= daysInMonth ? value : undefined;
}

/** A non-empty string, null, or undefined when the value is neither. */
function readNullableString(value: unknown): string | null | undefined {
  if (value === null) return null;
  return nonEmptyString(value);
}

/**
 * `MetadataV1.Metadata` (`{values: {key: string}}`), or undefined when it is not of that shape. The values live in a
 * null-prototype, read-only record, so a key such as `__proto__` stays plain data.
 */
export function readHoldingViewMetadata(value: unknown): HoldingViewMetadata | undefined {
  if (!isRecord(value) || !isRecord(value['values'])) return undefined;
  const values = Object.create(null) as Record<string, string>;
  for (const [key, metadataValue] of Object.entries(value['values'])) {
    if (typeof metadataValue !== 'string') return undefined;
    Object.defineProperty(values, key, { value: metadataValue, enumerable: true, configurable: true, writable: false });
  }
  return { values };
}

/** `Optional HoldingV1.Lock`: null for None, the lock, or undefined when it is not readable. */
export function readHoldingViewLock(value: unknown): HoldingViewLock | null | undefined {
  if (value === null) return null;
  if (!isRecord(value) || !Array.isArray(value['holders'])) return undefined;
  const { holders } = value;
  if (!holders.every((holder) => nonEmptyString(holder) !== undefined)) return undefined;
  const expiresAt = readNullableString(value['expiresAt']);
  // Descriptive Optional Text: an empty context is valid (Splice copies it into the view as is).
  const rawContext = value['context'];
  const context = rawContext === null || typeof rawContext === 'string' ? rawContext : undefined;
  const rawExpiresAfter = value['expiresAfter'];
  let expiresAfter: HoldingViewLock['expiresAfter'];
  if (rawExpiresAfter === null) {
    expiresAfter = null;
  } else if (
    isRecord(rawExpiresAfter) &&
    typeof rawExpiresAfter['microseconds'] === 'string' &&
    SIGNED_INTEGER_PATTERN.test(rawExpiresAfter['microseconds'])
  ) {
    expiresAfter = { microseconds: rawExpiresAfter['microseconds'] };
  } else {
    return undefined;
  }
  if (expiresAt === undefined || context === undefined) return undefined;
  return { holders: holders as string[], expiresAt, expiresAfter, context };
}

/** A `HoldingV1.HoldingView` value, or undefined when any field is missing or malformed. */
export function readHoldingView(value: unknown): HoldingView | undefined {
  if (!isRecord(value)) return undefined;
  const owner = nonEmptyString(value['owner']);
  const instrumentId = readInstrumentId(value['instrumentId']);
  const amount = nonEmptyString(value['amount']);
  const lock = readHoldingViewLock(value['lock']);
  const meta = readHoldingViewMetadata(value['meta']);
  if (owner === undefined || instrumentId === null || amount === undefined || lock === undefined || !meta) {
    return undefined;
  }
  return { owner, instrumentId, amount, lock, meta };
}

/** Whether an interface id (either form) is `HoldingV1`'s, by `Module:Entity`. */
export function isHoldingV1InterfaceId(interfaceId: string): boolean {
  const name = qualifiedName(interfaceId);
  return name !== null && name === qualifiedName(HOLDING_V1_INTERFACE_ID);
}

/**
 * The contract's `HoldingV1` view, or undefined when the read did not include exactly one successfully computed view of
 * that interface (a view whose computation failed, `viewStatus.code` not 0, counts as none).
 */
export function holdingViewOf(contract: Pick<ActiveContract, 'interfaceViews'>): HoldingView | undefined {
  const views = (contract.interfaceViews ?? []).filter((view: InterfaceView) =>
    isHoldingV1InterfaceId(view.interfaceId)
  );
  const [view] = views;
  if (views.length !== 1 || view?.viewStatusCode !== 0) return undefined;
  return readHoldingView(view.viewValue);
}
