/**
 * Whose events a ledger read returns: the events of a list of parties, or the events of every party the participant
 * hosts.
 *
 * A party list is a filter. A party the list misses, such as one allocated after the list was written, is read as if it
 * did not exist, without any error. `{ anyParty: true }` sends `filtersForAnyParty` instead, which covers every party
 * on the participant, including parties that appear later. It needs the user's `CanReadAsAnyParty` right; check it with
 * `assertCanReadAsAnyParty` before a long read.
 *
 * The two forms exclude each other: the types reject an object with both keys, and the reads reject one at run time.
 */
import { z } from 'zod';
import { isRecord } from '../../../../../core/utils/type-guards';

/** Read as the listed parties (`filtersByParty`). */
export interface PartiesScope {
  /** Parties to read as. */
  readonly parties: string[];
  readonly anyParty?: never;
}

/** Read as every party the participant hosts (`filtersForAnyParty`). Needs the `CanReadAsAnyParty` right. */
export interface AnyPartyScope {
  readonly anyParty: true;
  readonly parties?: never;
}

/** Whose events a format selects: `{ parties }` or `{ anyParty: true }`, never both. */
export type PartyScope = AnyPartyScope | PartiesScope;

/** True when the scope reads as every party. */
export function isAnyPartyScope(scope: PartyScope): scope is AnyPartyScope {
  return scope.anyParty === true;
}

/**
 * A schema that rejects `anyParty` with any value other than `true`, and `anyParty` together with the party-list key
 * the operation uses (`parties` or `readAs`), with a message naming both. Pipe it into the operation's
 * `z.discriminatedUnion('anyParty', [partyListSchema, anyPartySchema])`: it runs first, so the caller sees this message
 * rather than a discriminator mismatch, and the discriminated union then reports any other problem at its field,
 * exactly as the party-list schema alone does.
 */
export function partyScopeGuard(listKey: 'parties' | 'readAs'): z.ZodType<unknown> {
  return z.unknown().superRefine((value, ctx) => {
    if (!isRecord(value) || value['anyParty'] === undefined) return;
    if (value['anyParty'] !== true) {
      ctx.addIssue({ code: 'custom', path: ['anyParty'], message: 'anyParty must be true when it is given' });
    } else if (value[listKey] !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['anyParty'],
        message: `pass either anyParty: true or ${listKey}, not both`,
      });
    }
  });
}
