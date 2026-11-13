/** CIP-56 instrument ids read from untrusted JSON (interface views, create arguments, registry answers). */
import { isRecord, nonEmptyString } from './json';
import type { InstrumentId } from './types';

/** `{admin, id}` when both are non-empty strings, else null. */
export function readInstrumentId(value: unknown): InstrumentId | null {
  if (!isRecord(value)) return null;
  const admin = nonEmptyString(value['admin']);
  const id = nonEmptyString(value['id']);
  return admin !== undefined && id !== undefined ? { admin, id } : null;
}

export function sameInstrument(left: InstrumentId, right: InstrumentId): boolean {
  return left.admin === right.admin && left.id === right.id;
}
