import { type Completion } from '../../clients/ledger-json-api/schemas/api/completions';

/**
 * Reads `paidTrafficCost` from a Ledger API completion when the field is present (Canton emits this on the completions
 * stream and blocking completions query). Returns `undefined` if the server omits the field.
 *
 * Completion schemas normalize wire number|string|null to a digit string (or omit). Decimal digit strings (int64 JSON
 * encoding) are parsed with `BigInt(string)`.
 */
export function getPaidTrafficCostFromCompletion(completion: Completion): bigint | undefined {
  const raw = completion.value.paidTrafficCost;
  if (typeof raw === 'string' && /^\d+$/.test(raw)) {
    return BigInt(raw);
  }
  return undefined;
}
