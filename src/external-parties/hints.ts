/**
 * Party hints for new external parties: a short, readable suggestion, and the check of a hint a user typed. Pure and
 * browser-safe. A party ID already carries its key's fingerprint, so a hint only has to be unique among that key's own
 * parties. The hint is public and permanent on the ledger (every counterparty, Scan and explorers see the party ID):
 * never a name, email or other personal data.
 */

/** The hint {@link suggestExternalPartyHint} uses when given no base name. */
export const DEFAULT_EXTERNAL_PARTY_HINT = 'wallet';

/** The longest base {@link suggestExternalPartyHint} keeps, before any `-2`, `-3`, ... suffix. */
export const MAX_SUGGESTED_EXTERNAL_PARTY_HINT_BASE_LENGTH = 24;

/** The longest new party hint {@link validateExternalPartyHint} accepts. */
export const MAX_NEW_EXTERNAL_PARTY_HINT_LENGTH = 40;

/** The most characters of `base` {@link suggestExternalPartyHint} reads: far more than it keeps. */
const MAX_BASE_INPUT_LENGTH = 1_000;

const NEW_PARTY_HINT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/u;

/**
 * Why a new party hint is refused:
 *
 * - `empty`: nothing but whitespace.
 * - `too-long`: more than {@link MAX_NEW_EXTERNAL_PARTY_HINT_LENGTH} characters.
 * - `charset`: not a letter or digit followed by letters, digits, `-` and `_`.
 * - `taken`: one of the key's parties already has it (use that party instead).
 */
export type ExternalPartyHintError = 'empty' | 'too-long' | 'charset' | 'taken';

/**
 * A short, readable party hint, unique among the key's parties: `base` reduced to lowercase letters, digits and dashes
 * (at most {@link MAX_SUGGESTED_EXTERNAL_PARTY_HINT_BASE_LENGTH} characters), or `fallback`
 * ({@link DEFAULT_EXTERNAL_PARTY_HINT} by default), then `-2`, `-3`, ... until it is not one of `taken` (the hints of
 * the key's parties). Pass an app label or a nickname the user picks as `base`.
 */
export function suggestExternalPartyHint(
  options: {
    readonly base?: string;
    readonly taken?: Iterable<string>;
    readonly fallback?: string;
  } = {}
): string {
  // Linear-time steps only: the input is bounded first, and dashes are trimmed without a backtracking pattern.
  const reduced = (typeof options.base === 'string' ? options.base : '')
    .slice(0, MAX_BASE_INPUT_LENGTH)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-');
  const base =
    trimDashes(trimDashes(reduced).slice(0, MAX_SUGGESTED_EXTERNAL_PARTY_HINT_BASE_LENGTH)) ||
    (options.fallback ?? DEFAULT_EXTERNAL_PARTY_HINT);
  const taken = new Set(options.taken ?? []);
  if (!taken.has(base)) return base;
  for (let suffix = 2; ; suffix += 1) {
    const hint = `${base}-${suffix}`;
    if (!taken.has(hint)) return hint;
  }
}

/**
 * Checks a hint the user typed for a **new** party, after trimming it: null when it is fine, else why not. `taken` is
 * the hints the key's parties already have.
 *
 * Only for new names: an existing party keeps its hint, which may be longer or use other characters, so check `taken`
 * first and use an existing party by its own hint without validating it. The rule is deliberately narrower than what
 * the participant accepts, so a hint is short, readable and safe in a URL.
 */
export function validateExternalPartyHint(hint: string, taken: readonly string[] = []): ExternalPartyHintError | null {
  const trimmed = typeof hint === 'string' ? hint.trim() : '';
  if (trimmed === '') return 'empty';
  if (trimmed.length > MAX_NEW_EXTERNAL_PARTY_HINT_LENGTH) return 'too-long';
  if (!NEW_PARTY_HINT_PATTERN.test(trimmed)) return 'charset';
  if (taken.includes(trimmed)) return 'taken';
  return null;
}

/** `value` without leading and trailing dashes. */
function trimDashes(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && value[start] === '-') start += 1;
  while (end > start && value[end - 1] === '-') end -= 1;
  return value.slice(start, end);
}
