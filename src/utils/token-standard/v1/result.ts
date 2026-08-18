import { isRecord } from '../../../core/utils';
import { findExercisedEvent, getTransactionUpdateId, requireExerciseResult } from '../../parsers/event-parser';
import { TokenStandardV1ResultError, TokenStandardV1ResultErrorCode } from './errors';

/** The record a standard choice returned, or a failure: a caller asking for it asserts the transaction contains it. */
export function requireResultRecord(transaction: unknown, choice: string): Record<string, unknown> {
  const result = requireExerciseResult(transaction, choice);
  if (!isRecord(result)) {
    throw new TokenStandardV1ResultError(
      TokenStandardV1ResultErrorCode.RESULT_INVALID,
      `The ${choice} exercise returned no result record.`,
      { choice, updateId: getTransactionUpdateId(transaction) }
    );
  }
  return result;
}

/** The record returned by the first of `choices` this transaction exercised. */
export function requireResultRecordOfAny(transaction: unknown, choices: readonly string[]): Record<string, unknown> {
  const exercised = findExercisedEvent(transaction, choices);
  if (!exercised) {
    throw new TokenStandardV1ResultError(
      TokenStandardV1ResultErrorCode.RESULT_NOT_FOUND,
      `The transaction contains none of these exercises: ${choices.join(', ')}.`,
      { choices: [...choices], updateId: getTransactionUpdateId(transaction) }
    );
  }
  if (!isRecord(exercised.exerciseResult)) {
    throw new TokenStandardV1ResultError(
      TokenStandardV1ResultErrorCode.RESULT_INVALID,
      `The ${exercised.choice} exercise returned no result record.`,
      { choice: exercised.choice, updateId: getTransactionUpdateId(transaction) }
    );
  }
  return exercised.exerciseResult;
}

/** A required list of contract ids from a result record. */
export function requireContractIds(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) {
    throw new TokenStandardV1ResultError(
      TokenStandardV1ResultErrorCode.RESULT_INVALID,
      `The exercise result has no ${field}.`,
      { field }
    );
  }
  return value.filter((entry): entry is string => typeof entry === 'string');
}

/** An optional list of contract ids, which the token standard omits rather than sending empty on some paths. */
export function readContractIds(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

/** `{ tag, value }`, the Daml JSON encoding of a variant. */
export function readVariant(
  value: unknown
): { readonly tag: string; readonly value: Record<string, unknown> } | undefined {
  if (!isRecord(value) || typeof value['tag'] !== 'string') return undefined;
  return { tag: value['tag'], value: isRecord(value['value']) ? value['value'] : {} };
}

/**
 * A variant field of a result record, which must be one of the variants the reader knows.
 *
 * A missing field or an unrecognized tag is reported rather than folded into the nearest status. The standard's
 * `_Failed` output means the units went back to the sender, so answering an unknown tag with it would tell a caller a
 * transfer was returned when nothing here knows what happened to it.
 */
export function requireKnownVariant(
  result: Record<string, unknown>,
  field: string,
  known: readonly string[],
  what: string
): { readonly tag: string; readonly value: Record<string, unknown> } {
  const variant = readVariant(result[field]);
  if (!variant) {
    throw new TokenStandardV1ResultError(
      TokenStandardV1ResultErrorCode.RESULT_INVALID,
      `The ${what} names no ${field}.`,
      { field }
    );
  }
  if (!known.includes(variant.tag)) {
    throw new TokenStandardV1ResultError(
      TokenStandardV1ResultErrorCode.RESULT_INVALID,
      `Unknown ${what} ${field}: ${variant.tag}.`,
      { field, tag: variant.tag, known: [...known] }
    );
  }
  return variant;
}
