import { type LedgerJsonApiClient } from '../../clients';
import { CantonError } from '../../core/errors';
import { isRecord } from '../../core/utils/type-guards';

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

/** The rights of the user the client's token authenticates. */
export interface AuthenticatedUserRights {
  /** The authenticated user's id (`GET /v2/authenticated-user`). */
  readonly userId: string;
  /** The user's rights as `GET /v2/users/{user-id}/rights` listed them. */
  readonly rights: readonly unknown[];
  /** Each right in readable form, e.g. `CanReadAsAnyParty`, `CanActAs(Alice::1220...)`, `ParticipantAdmin`. */
  readonly rightNames: readonly string[];
  /** Whether the user holds `CanReadAsAnyParty`, which any-party reads (`anyParty: true`) need. */
  readonly canReadAsAnyParty: boolean;
}

/** Error code of {@link MissingUserRightError}. */
export const MISSING_USER_RIGHT_ERROR_CODE = 'MISSING_USER_RIGHT';

/** The authenticated ledger user lacks a right an operation needs. */
export class MissingUserRightError extends CantonError {
  public override readonly name: string;

  constructor(
    /** The authenticated user's id. */
    public readonly userId: string,
    /** The right that is missing, e.g. `CanReadAsAnyParty`. */
    public readonly requiredRight: string,
    /** The rights the user holds, in readable form. */
    public readonly rights: readonly string[]
  ) {
    super(
      `Ledger user "${userId}" does not hold the ${requiredRight} right; its rights are: ${
        rights.length > 0 ? rights.join(', ') : '(none)'
      }`,
      MISSING_USER_RIGHT_ERROR_CODE,
      { userId, requiredRight, rights: [...rights] }
    );
    this.name = 'MissingUserRightError';
  }
}

/** A right in readable form: its kind, and the party for party rights. Accepts the right with or without `value`. */
function describeRight(right: unknown): string {
  const kind = isRecord(right) ? right['kind'] : undefined;
  const [name] = isRecord(kind) ? Object.keys(kind) : [];
  if (!isRecord(kind) || name === undefined) return JSON.stringify(right);
  const body = kind[name];
  const value = isRecord(body) && isRecord(body['value']) ? body['value'] : body;
  const party = isRecord(value) ? value['party'] : undefined;
  return typeof party === 'string' ? `${name}(${party})` : name;
}

/**
 * Reads the authenticated user (`GET /v2/authenticated-user`) and its rights (`GET /v2/users/{user-id}/rights`).
 *
 * @throws Error if the participant does not return the authenticated user's id
 */
export async function getAuthenticatedUserRights(client: LedgerJsonApiClient): Promise<AuthenticatedUserRights> {
  const response: unknown = await client.getAuthenticatedUser({});
  const user = isRecord(response) ? response['user'] : undefined;
  const userId = isRecord(user) ? user['id'] : undefined;
  if (typeof userId !== 'string' || userId.length === 0) {
    throw new Error('The ledger did not return the authenticated user');
  }
  const listed: unknown = await client.listUserRights({ userId });
  const listedRights = isRecord(listed) ? listed['rights'] : undefined;
  const rights: readonly unknown[] = Array.isArray(listedRights) ? listedRights : [];
  const rightNames = rights.map(describeRight);
  return { userId, rights, rightNames, canReadAsAnyParty: rightNames.includes('CanReadAsAnyParty') };
}

/**
 * Checks that the client's user holds `CanReadAsAnyParty`, the right that any-party reads (`anyParty: true`,
 * `buildUpdateFormat({ anyParty: true })`) need. Call it before a long any-party read so that a missing right stops the
 * reader at once, naming the user, instead of surfacing as a permission error later.
 *
 * @returns The user and its rights
 * @throws MissingUserRightError naming the user and the rights it holds, when `CanReadAsAnyParty` is not among them
 */
export async function assertCanReadAsAnyParty(client: LedgerJsonApiClient): Promise<AuthenticatedUserRights> {
  const status = await getAuthenticatedUserRights(client);
  if (!status.canReadAsAnyParty) {
    throw new MissingUserRightError(status.userId, 'CanReadAsAnyParty', status.rightNames);
  }
  return status;
}
