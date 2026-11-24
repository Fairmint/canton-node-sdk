/**
 * "Find every party this key controls": a key's parties from a party list, plus exact lookups of the hints the list may
 * not show. Pure orchestration over two callbacks, so it serves {@link createExternalPartyDirectory} and any other party
 * store (an app's own port, a test double) alike. Browser-safe.
 */
import { ExternalPartyError, invalidInput, isExternalPartyError } from './errors';
import {
  isCantonPublicKeyFingerprint,
  isExternalPartyHint,
  MAX_EXTERNAL_PARTY_ID_LENGTH,
  parseExternalPartyId,
} from './keys';

/** One of a key's parties. */
export interface ExternalPartyEntry {
  readonly partyId: string;
  /** What precedes `::` in the party ID. */
  readonly partyHint: string;
  /** Whether this participant hosts the party (it can prepare and submit for it here). */
  readonly hostedHere: boolean;
}

/** A key's parties, sorted by hint, and whether the party list they came from was read to its end. */
export interface ExternalPartyListing {
  readonly parties: readonly ExternalPartyEntry[];
  /**
   * False when the list was cut short (a page or time bound, or no list at all): a party the list and the exact lookups
   * did not show may still exist.
   */
  readonly complete: boolean;
}

/** {@link discoverExternalParties}' answer. */
export interface ExternalPartyDiscovery extends ExternalPartyListing {
  /**
   * False when hints were asked for, the list was not complete and there was no `findParty` to look them up: a hint
   * outside `parties` may then be taken. True otherwise.
   */
  readonly hintsChecked: boolean;
}

/** What a party list answers: party IDs (any namespace; only the key's are kept) and whether it was read to its end. */
export interface ExternalPartyListAnswer {
  readonly parties: ReadonlyArray<{ readonly partyId: string; readonly hostedHere: boolean }>;
  readonly complete: boolean;
}

/** What an exact party lookup answers. `hostedHere` omitted counts as hosted. */
export interface ExternalPartyLookupAnswer {
  readonly exists: boolean;
  readonly hostedHere?: boolean;
}

/** The most hints {@link discoverExternalParties} looks up in one call. */
export const MAX_EXTERNAL_PARTY_LOOKUP_HINTS = 16;

/**
 * A key's parties: what `listParties` answers in the key's namespace, plus an exact `findParty` of each of `hints` the
 * list did not show. The lookups run even when the list says complete (a cached list can predate a party allocated
 * since); with a complete list a failed lookup is skipped, with an incomplete one it fails the call (`LOOKUP_FAILED`).
 * Either callback may be left out: without `listParties` the answer is never complete; without `findParty` the hints
 * are not checked (`hintsChecked: false` when the list is incomplete).
 *
 * `signal` goes to each callback and each call is raced against it, so a callback that ignores it does not hold the
 * call open (`ABORTED`). A callback's failure is `LIST_FAILED` or `LOOKUP_FAILED` with its error as `cause` (an
 * {@link ExternalPartyError} `ABORTED` or `INVALID_RESPONSE` it throws passes through as it is), and an unreadable
 * answer is `INVALID_RESPONSE`. Nothing is recorded or allocated.
 */
export async function discoverExternalParties(input: {
  readonly publicKeyFingerprint: string;
  /** Hints to look up exactly (each non-empty, trimmed, without `::`); duplicates are looked up once. */
  readonly hints?: readonly string[];
  readonly signal?: AbortSignal;
  readonly listParties?: (request: { readonly signal?: AbortSignal }) => Promise<ExternalPartyListAnswer>;
  readonly findParty?: (request: {
    readonly partyId: string;
    readonly signal?: AbortSignal;
  }) => Promise<ExternalPartyLookupAnswer>;
}): Promise<ExternalPartyDiscovery> {
  const { publicKeyFingerprint, signal, listParties, findParty } = input;
  if (!isCantonPublicKeyFingerprint(publicKeyFingerprint)) {
    throw invalidInput(
      'publicKeyFingerprint must be a Canton SHA-256 multihash (1220 and 64 lowercase hex characters)'
    );
  }
  const hints = input.hints ?? [];
  if (
    !Array.isArray(hints) ||
    hints.length > MAX_EXTERNAL_PARTY_LOOKUP_HINTS ||
    !hints.every((hint) => isBoundedIdentifier(hint) && isExternalPartyHint(hint))
  ) {
    throw invalidInput(
      `hints must be at most ${MAX_EXTERNAL_PARTY_LOOKUP_HINTS} trimmed party hints of Daml-LF Party characters, without "::" or a trailing ":"`
    );
  }
  const found = new Map<string, boolean>();
  let complete = false;
  if (listParties !== undefined) {
    let listed: unknown;
    try {
      listed = await raceAbort(
        async () => listParties(signal ? { signal } : {}),
        signal,
        'The party listing was aborted.'
      );
    } catch (error) {
      if (isExternalPartyError(error, 'ABORTED', 'INVALID_RESPONSE')) throw error;
      throw new ExternalPartyError('LIST_FAILED', 'The participant could not list the parties.', { cause: error });
    }
    if (!isListAnswer(listed)) {
      throw new ExternalPartyError('INVALID_RESPONSE', 'The party list is invalid.');
    }
    for (const entry of listed.parties) {
      // Only the key's own parties, whatever the list answered.
      if (parseExternalPartyId(entry.partyId)?.namespace === publicKeyFingerprint) {
        found.set(entry.partyId, entry.hostedHere);
      }
    }
    ({ complete } = listed);
  }
  const hintsChecked = !(!complete && findParty === undefined && hints.length > 0);
  if (findParty !== undefined) {
    for (const hint of new Set(hints)) {
      const partyId = `${hint}::${publicKeyFingerprint}`;
      if (found.has(partyId) || partyId.length > MAX_EXTERNAL_PARTY_ID_LENGTH) continue;
      let lookup: unknown;
      try {
        lookup = await raceAbort(
          async () => findParty(signal ? { partyId, signal } : { partyId }),
          signal,
          'The party lookup was aborted.',
          partyId
        );
      } catch (error) {
        // An unreadable answer fails the call however it arrives (thrown, or returned and checked below).
        if (isExternalPartyError(error, 'ABORTED', 'INVALID_RESPONSE')) throw error;
        // With a complete list the lookups only add to it: a failed one is skipped, unless the call was aborted.
        if (complete && !signal?.aborted) continue;
        throw new ExternalPartyError('LOOKUP_FAILED', 'The participant could not look up the party.', {
          cause: error,
          partyId,
        });
      }
      if (!isLookupAnswer(lookup)) {
        throw new ExternalPartyError('INVALID_RESPONSE', 'The party lookup is invalid.', { partyId });
      }
      if (lookup.exists) found.set(partyId, lookup.hostedHere !== false);
    }
  }
  return Object.freeze({
    parties: sortedEntries(found),
    complete,
    hintsChecked,
  });
}

/** `parties` (party ID → hosted here) as frozen entries, sorted by hint (then party ID), in code-unit order. */
export function sortedEntries(parties: ReadonlyMap<string, boolean>): readonly ExternalPartyEntry[] {
  const entries = [...parties].map(([partyId, hostedHere]) =>
    Object.freeze({ partyId, partyHint: partyId.slice(0, partyId.indexOf('::')), hostedHere })
  );
  entries.sort((a, b) => compare(a.partyHint, b.partyHint) || compare(a.partyId, b.partyId));
  return Object.freeze(entries);
}

/** Awaits `start()`, unless `signal` aborts first (`ABORTED`); an already-aborted signal never starts it. */
export async function raceAbort<T>(
  start: () => Promise<T>,
  signal: AbortSignal | undefined,
  message: string,
  partyId?: string
): Promise<T> {
  const aborted = (): ExternalPartyError =>
    new ExternalPartyError('ABORTED', message, {
      cause: signal?.reason,
      ...(partyId === undefined ? {} : { partyId }),
    });
  if (!signal) return start();
  if (signal.aborted) throw aborted();
  const promise = start();
  let onAbort: () => void = () => undefined;
  const abortedWait = new Promise<never>((_, reject) => {
    onAbort = () => reject(aborted());
    signal.addEventListener('abort', onAbort, { once: true });
    // `start()` may itself have aborted the signal, before the listener could hear it.
    if (signal.aborted) onAbort();
  });
  abortedWait.catch(() => undefined);
  promise.catch(() => undefined);
  try {
    return await Promise.race([promise, abortedWait]);
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}

/** A string of 1 to 255 characters (a Daml-LF Party at most), trimmed, on one line: what a listing may answer. */
export function isBoundedIdentifier(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_EXTERNAL_PARTY_ID_LENGTH &&
    value.trim() === value &&
    !/[\r\n]/u.test(value)
  );
}

function isListAnswer(value: unknown): value is ExternalPartyListAnswer {
  if (typeof value !== 'object' || value === null) return false;
  const { parties, complete } = value as Record<string, unknown>;
  return (
    typeof complete === 'boolean' &&
    Array.isArray(parties) &&
    parties.every(
      (entry: unknown) =>
        typeof entry === 'object' &&
        entry !== null &&
        isBoundedIdentifier((entry as Record<string, unknown>)['partyId']) &&
        typeof (entry as Record<string, unknown>)['hostedHere'] === 'boolean'
    )
  );
}

function isLookupAnswer(value: unknown): value is ExternalPartyLookupAnswer {
  if (typeof value !== 'object' || value === null) return false;
  const { exists, hostedHere } = value as Record<string, unknown>;
  return typeof exists === 'boolean' && (hostedHere === undefined || typeof hostedHere === 'boolean');
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
