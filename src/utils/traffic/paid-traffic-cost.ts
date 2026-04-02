import { type Completion } from '../../clients/ledger-json-api/schemas/api/completions';

/**
 * Reads `paidTrafficCost` from a Ledger API completion when the field is present (Canton emits this on the completions
 * stream and blocking completions query). Returns `undefined` if the server omits the field.
 *
 * For JSON numbers, only `Number.isSafeInteger` values are accepted (avoid misleading `bigint` from doubles). Decimal
 * strings (common int64 JSON encoding) are parsed with `BigInt(string)`.
 */
export function getPaidTrafficCostFromCompletion(completion: Completion): bigint | undefined {
  const raw = completion.value.paidTrafficCost;
  if (typeof raw === 'number' && Number.isSafeInteger(raw)) {
    return BigInt(raw);
  }
  if (typeof raw === 'string' && /^\d+$/.test(raw)) {
    return BigInt(raw);
  }
  return undefined;
}
