import { type LedgerJsonApiClient } from '../../clients';

export interface UserActAsStatus {
  /** The authenticated user's id. */
  userId: string;
  /** Which of the requested parties the user may NOT act as. */
  missing: string[];
  /** Whether the user holds the ParticipantAdmin right (required to upload DARs). */
  participantAdmin: boolean;
}

interface RightKind {
  kind?: { CanActAs?: { value?: { party?: string }; party?: string }; ParticipantAdmin?: unknown };
}

function canActAsParty(right: RightKind): string | undefined {
  // The request shape nests the right under `value`; the response schema does not. Accept both.
  return right.kind?.CanActAs?.value?.party ?? right.kind?.CanActAs?.party;
}

/**
 * Checks which of `parties` the authenticated user may act as, and whether it is a participant admin.
 *
 * Every caller should name its parties explicitly: a client's default party is typically the validator party, and
 * falling back to it would read or act as the wrong party.
 */
export async function checkUserActAs(client: LedgerJsonApiClient, parties: string[]): Promise<UserActAsStatus> {
  const { user } = await client.getAuthenticatedUser({});
  // The schema requires the user, but a misbehaving participant can still omit it; fail with a clear error.
  const userId = (user as { id?: string } | undefined)?.id;
  if (!userId) throw new Error('The ledger did not return the authenticated user');
  const { rights } = await client.listUserRights({ userId });
  const actable = new Set(
    ((rights ?? []) as RightKind[]).map(canActAsParty).filter((p): p is string => p !== undefined)
  );
  return {
    userId,
    missing: parties.filter((p) => !actable.has(p)),
    participantAdmin: ((rights ?? []) as RightKind[]).some((r) => r.kind?.ParticipantAdmin !== undefined),
  };
}
