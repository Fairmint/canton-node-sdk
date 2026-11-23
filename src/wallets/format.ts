/**
 * Display helpers for wallet pages. They return trimmed text or codes, never sentences, so the page keeps its own
 * wording (and can translate it).
 */
import type { PreapprovalScope } from './contracts';

/**
 * An SDK amount (a decimal string, usually with 10 places: `4.0000000000`) without the trailing zeros of its fraction,
 * nor a bare point: `4`, `1.25`. A string without a point is returned unchanged.
 */
export function formatTokenAmount(amount: string): string {
  return amount.includes('.') ? amount.replace(/\.?0+$/, '') : amount;
}

/** How long before a deadline {@link formatOfferExpiry} reports it as `soon`: 48 hours. */
export const OFFER_EXPIRY_SOON_MS = 48 * 60 * 60 * 1000;

/**
 * When an offer's deadline falls, relative to now (see {@link formatOfferExpiry}):
 *
 * - `expired`: it has passed (`msLeft` is zero or negative);
 * - `soon`: within `soonMs` (48 hours by default); show `msLeft` as minutes or hours;
 * - `later`: further away; show `at` as a date.
 */
export interface OfferExpiry {
  readonly kind: 'expired' | 'soon' | 'later';
  /** The deadline, in milliseconds since the epoch. */
  readonly at: number;
  /** `at` minus now, in milliseconds. */
  readonly msLeft: number;
}

/**
 * Where an offer's `executeBefore` (an ISO 8601 instant) stands at `now` (milliseconds since the epoch, `Date.now()` by
 * default), or null when it cannot be read. A page words it: `expired`, `expires in 23 h`, `expires Nov 25`.
 */
export function formatOfferExpiry(
  executeBefore: string,
  now: number = Date.now(),
  options: { readonly soonMs?: number } = {}
): OfferExpiry | null {
  const at = Date.parse(executeBefore);
  if (Number.isNaN(at)) return null;
  const msLeft = at - now;
  const soonMs = options.soonMs ?? OFFER_EXPIRY_SOON_MS;
  return { kind: msLeft <= 0 ? 'expired' : msLeft < soonMs ? 'soon' : 'later', at, msLeft };
}

/** What a transfer preapproval covers, as {@link describePreapprovalScope} reports it. */
export type PreapprovalScopeDescription =
  /** Every instrument of its admin (the issuer). */
  | { readonly kind: 'issuer' }
  /** Only these instrument ids of its admin. */
  | { readonly kind: 'instruments'; readonly instrumentIds: readonly string[] };

/** Whether a preapproval covers every token of its issuer, or only the instrument ids it names. */
export function describePreapprovalScope(
  preapproval: Pick<PreapprovalScope, 'instrumentIds'>
): PreapprovalScopeDescription {
  return preapproval.instrumentIds.length === 0
    ? { kind: 'issuer' }
    : { kind: 'instruments', instrumentIds: [...preapproval.instrumentIds] };
}

/**
 * A long Canton id shortened for display, `keep` characters (8 by default) kept at each end: a party id with a short
 * hint (`alice::1220…`, the hint at most 24 characters) keeps the hint and the fingerprint's tail (`alice::aaaaaaaa`);
 * any other id keeps both ends around an ellipsis (`01234567…stuvwxyz`). An id of at most `2 * keep + 3` characters is
 * returned unchanged. For display only: never compare or parse the result.
 */
export function shortCantonId(id: string, keep = 8): string {
  if (id.length <= keep * 2 + 3) return id;
  const separator = id.indexOf('::');
  if (separator > 0 && separator <= 24) {
    return `${id.slice(0, separator)}::${id.slice(-keep)}`;
  }
  return `${id.slice(0, keep)}…${id.slice(-keep)}`;
}
