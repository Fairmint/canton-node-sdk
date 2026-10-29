import { type LedgerJsonApiClient } from '../../clients';

export interface UserActAsStatus {
  /** The authenticated user's id. */
  userId: string;
  /** Which of the requested parties the user may NOT act as. */
  missing: string[];
  /** Whether the user holds the ParticipantAdmin right (required to upload DARs). */
  participantAdmin: boolean;
}

/** What a ledger user can read, from its user rights. */
export interface LedgerVisibility {
  /** The ledger user id the rights belong to. */
  userId: string;
  /**
   * Whether the user holds `CanReadAsAnyParty`, so it may read with `filtersForAnyParty` (`anyParty: true`). There is
   * no act-as-any-party user right, `CanExecuteAsAnyParty` grants no reads, and `ParticipantAdmin` is not enough.
   */
  canReadAsAnyParty: boolean;
  /** The parties the user may read as one by one: the union of its `CanActAs` and `CanReadAs` rights, sorted. */
  readableParties: string[];
  /** Whether the user holds the ParticipantAdmin right. */
  participantAdmin: boolean;
}

/** A party right; the request shape nests it under `value`, older response schemas do not. */
type PartyRight = { value?: { party?: string }; party?: string } | undefined;

/**
 * The kinds of user right Canton maps to claims (`UserBasedClaimResolver`). Both shapes are accepted: the request shape
 * nests each right under `value`, and older response schemas did not.
 */
interface RightKind {
  kind?: {
    CanActAs?: PartyRight;
    CanReadAs?: PartyRight;
    CanExecuteAs?: PartyRight;
    CanReadAsAnyParty?: unknown;
    CanExecuteAsAnyParty?: unknown;
    ParticipantAdmin?: unknown;
    IdentityProviderAdmin?: unknown;
  };
}

function rightParty(right: PartyRight): string | undefined {
  return right?.value?.party ?? right?.party;
}

function canActAsParty(right: RightKind): string | undefined {
  return rightParty(right.kind?.CanActAs);
}

function canReadAsParty(right: RightKind): string | undefined {
  return rightParty(right.kind?.CanReadAs);
}

function definedParties(rights: RightKind[], party: (right: RightKind) => string | undefined): string[] {
  return rights.map(party).filter((p): p is string => p !== undefined);
}

async function authenticatedUserId(client: LedgerJsonApiClient): Promise<string> {
  const { user } = await client.getAuthenticatedUser({});
  // The schema requires the user, but a misbehaving participant can still omit it; fail with a clear error.
  const userId = (user as { id?: string } | undefined)?.id;
  if (!userId) throw new Error('The ledger did not return the authenticated user');
  return userId;
}

async function listRights(client: LedgerJsonApiClient, userId: string): Promise<RightKind[]> {
  const { rights } = await client.listUserRights({ userId });
  return (rights ?? []) as RightKind[];
}

/**
 * Checks which of `parties` the authenticated user may act as, and whether it is a participant admin.
 *
 * Every caller should name its parties explicitly: a client's default party is typically the validator party, and
 * falling back to it would read or act as the wrong party.
 */
export async function checkUserActAs(client: LedgerJsonApiClient, parties: string[]): Promise<UserActAsStatus> {
  const userId = await authenticatedUserId(client);
  const rights = await listRights(client, userId);
  const actable = new Set(definedParties(rights, canActAsParty));
  return {
    userId,
    missing: parties.filter((p) => !actable.has(p)),
    participantAdmin: rights.some((r) => r.kind?.ParticipantAdmin !== undefined),
  };
}

/**
 * Reports what a ledger user can read: whether it may use any-party reads, and which parties it may read as. Without
 * `userId` (or with an empty one) it checks the authenticated user.
 *
 * An explicit `userId` describes that user's rights, not necessarily what this client's token can read: the client
 * reads as the user its token authenticates.
 *
 * Rights can change while a reader runs (Canton then aborts its streams), so long-running readers should resolve this
 * again on reconnect. Listing another user's rights needs ParticipantAdmin or IdentityProviderAdmin.
 */
export async function resolveLedgerVisibility(
  client: LedgerJsonApiClient,
  options: { userId?: string } = {}
): Promise<LedgerVisibility> {
  // An empty userId is absent: `??` would list the rights of a user named ''.
  const userId =
    options.userId === undefined || options.userId === '' ? await authenticatedUserId(client) : options.userId;
  const rights = await listRights(client, userId);
  const readableParties = [
    ...new Set([...definedParties(rights, canActAsParty), ...definedParties(rights, canReadAsParty)]),
  ].sort();
  return {
    userId,
    canReadAsAnyParty: rights.some((r) => r.kind?.CanReadAsAnyParty !== undefined),
    readableParties,
    participantAdmin: rights.some((r) => r.kind?.ParticipantAdmin !== undefined),
  };
}
