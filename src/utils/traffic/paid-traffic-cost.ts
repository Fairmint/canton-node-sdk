import { type Completion } from '../../clients/ledger-json-api/schemas/api/completions';

/**
 * Reads `paidTrafficCost` from a Ledger API completion when the field is present (Canton emits this on the completions
 * stream and blocking completions query). Returns `undefined` if the server omits the field.
 *
 * Only accepts `Number.isSafeInteger` values: JSON numbers above `Number.MAX_SAFE_INTEGER` are not precisely
 * representable in JS; we avoid converting those to a misleading `bigint`.
 */
export function getPaidTrafficCostFromCompletion(completion: Completion): bigint | undefined {
  const raw = completion.value.paidTrafficCost;
  if (typeof raw !== 'number' || !Number.isSafeInteger(raw)) {
    return undefined;
  }
  return BigInt(raw);
}
