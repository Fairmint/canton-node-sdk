// Internal: not re-exported from the external-signing barrel.
import { CantonUserIdSchema } from '../../clients/ledger-json-api/operations/v2/parties/external/allocate-external-party';
import { ValidationError } from '../../core/errors';

/**
 * Validates and trims the participant user id with Canton's user id rule (the allocate operation's own schema). Callers
 * run it before preparing or signing, so a bad id never reaches a signer or the ledger.
 */
export function normalizeAllocationUserId(value: string): string {
  const result = CantonUserIdSchema.safeParse(value);
  if (!result.success) {
    throw new ValidationError(result.error.issues[0]?.message ?? 'userId is invalid', { userId: value });
  }
  return result.data;
}
