/**
 * LedgerJsonApiClient integration tests: reading as every party
 *
 * Checks the any-party reads against a real participant: the CanReadAsAnyParty right and the refusal without it, a raw
 * updates page and a raw updates stream of the same update (the same bytes, close, resume without a repeat), the active
 * contracts of every party, a user's raw completions, and another user's completions, which only a holder of the right
 * may read.
 *
 * The known activity is a transfer offer from the validator's wallet to a party this test allocates and grants to no
 * user, so only an any-party read sees that party's side of it.
 */

import { randomUUID } from 'node:crypto';

import {
  ApiError,
  CantonError,
  CantonRuntime,
  LedgerJsonApiClient,
  MissingUserRightError,
  RawStreamError,
  assertCanReadAsAnyParty,
  buildUpdateFormat,
  getAuthenticatedUserRights,
  type ActiveContractsStream,
  type AuthenticatedUserRights,
  type RawCompletionFrame,
  type RawFrame,
  type RawPageUpdate,
  type RawStreamEnd,
  type RawStreamSubscription,
  type RawUpdateFrame,
  type RawUpdatesPage,
} from '../../../../src';
import { isRecord } from '../../../../src/core/utils';
import { getLocalnetNonAdminLedgerClient, listCreatedEvents, retry } from '@fairmint/canton-dev-tools/testing';
import { getClient, resolveValidatorPartyId, resolveWalletAppInstallContext } from './setup';

const WALLET_APP_INSTALL_TEMPLATE_ID = '#splice-wallet:Splice.Wallet.Install:WalletAppInstall';
const TRANSFER_OFFER_TEMPLATE_SUFFIX = 'Splice.Wallet.TransferOffer:TransferOffer';
const TRANSFER_OFFER_TEMPLATE_ID = `#splice-wallet:${TRANSFER_OFFER_TEMPLATE_SUFFIX}`;

const READ_AS_ANY_PARTY_RIGHT = { kind: { CanReadAsAnyParty: { value: {} } } } as const;

/** Every party's transactions (with created-event blobs), reassignments and topology events: an archive reader's format. */
const ANY_PARTY_UPDATE_FORMAT = buildUpdateFormat({
  anyParty: true,
  includeCreatedEventBlob: true,
  includeTopologyEvents: true,
});

/**
 * The gRPC status PERMISSION_DENIED: how Canton refuses a read that needs a right the user lacks. A raw stream's error
 * frame carries it as `grpcCodeValue`; a request gets it as HTTP 403.
 */
const GRPC_PERMISSION_DENIED = 7;

/**
 * The cause Canton sends instead of the details of a security-sensitive error. PERMISSION_DENIED is one such error, but
 * so are INTERNAL, UNAUTHENTICATED and a few others, and the SDK's active-contracts error keeps only Canton's code and
 * cause, not the gRPC status. A match alone therefore does not prove a missing right: the refusal is checked next to
 * the same read for the user's own parties, which must succeed.
 */
const REDACTED_CAUSE_PATTERN = /security-sensitive error/;

/** Keys whose arrays are sets (of parties or interfaces): their order is not part of the value. */
const UNORDERED_ARRAY_KEYS: ReadonlySet<string> = new Set([
  'actingParties',
  'implementedInterfaces',
  'observers',
  'signatories',
  'witnessParties',
]);

const TEST_TIMEOUT_MS = 180_000;
/** Longest wait for a stream to deliver a frame that is already on the ledger. */
const STREAM_DEADLINE_MS = 90_000;

/** A transfer offer that this test submitted. */
interface TransferOfferSubmission {
  readonly commandId: string;
  readonly updateId: string;
  readonly offset: number;
  /** The created `TransferOffer`. */
  readonly contractId: string;
  /** The DSO party the offer names. */
  readonly dso: string;
}

/** The known activity every read below looks for. */
interface Activity extends TransferOfferSubmission {
  /** The authenticated ledger user, which submitted the offer. */
  readonly userId: string;
  /** The party the user acted as: the app-provider validator's party. */
  readonly submitter: string;
  /** A party allocated by this test with no user rights, the offer's receiver. */
  readonly receiver: string;
  /** The ledger end just before the submission. */
  readonly beginExclusive: number;
  readonly walletAppInstallContractId: string;
  readonly synchronizerId: string | undefined;
}

type Outcome = { readonly ok: true } | { readonly ok: false; readonly error: unknown };

interface RawRead<Frame> {
  /** Every frame received, in order, ending with `last`. */
  readonly frames: readonly Frame[];
  /** The frame the read waited for. */
  readonly last: Frame;
  readonly end: RawStreamEnd;
}

async function outcomeOf(operation: Promise<unknown>): Promise<Outcome> {
  try {
    await operation;
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}

/** How a stream that ends on its own ended; it is closed afterwards, and also when it misses the deadline. */
async function streamOutcome(stream: RawStreamSubscription, description: string): Promise<Outcome> {
  try {
    return await outcomeOf(withDeadline(stream.done, STREAM_DEADLINE_MS, description));
  } finally {
    stream.close();
  }
}

/** The error in one line: its name, HTTP status, message and context, for matching against a refusal. */
function describeFailure(error: unknown): string {
  if (!(error instanceof Error)) return `non-error ${JSON.stringify(error)}`;
  const status = error instanceof ApiError && error.status !== undefined ? ` status=${error.status}` : '';
  const context =
    error instanceof CantonError && error.context !== undefined ? ` ${JSON.stringify(error.context)}` : '';
  return `${error.name}${status}: ${error.message}${context}`;
}

async function readLedgerEnd(client: LedgerJsonApiClient): Promise<number> {
  const { offset } = await client.getLedgerEnd({});
  if (offset === undefined) {
    throw new Error('getLedgerEnd returned no offset');
  }
  return offset;
}

async function withDeadline<T>(promise: Promise<T>, timeoutMs: number, description: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Timed out after ${timeoutMs} ms waiting for ${description}`));
    }, timeoutMs);
  });
  try {
    return await Promise.race([promise, deadline]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Reads a raw stream from `beginExclusive` until `isLast` accepts a frame, closing the stream from inside `onFrame` so
 * that its `lastOffset` is exactly that frame's offset. A stream that ends for a token refresh is resumed from its
 * `lastOffset`, as the SDK documents; any other end before the frame, or the deadline, fails the read. The stream is
 * always closed before this returns.
 */
async function readRawUntil<Frame extends RawFrame>(
  open: (beginExclusive: number, onFrame: (frame: Frame) => void) => RawStreamSubscription,
  beginExclusive: number,
  isLast: (frame: Frame) => boolean,
  description: string
): Promise<RawRead<Frame>> {
  const frames: Frame[] = [];
  const found: { frame?: Frame } = {};
  const deadline = Date.now() + STREAM_DEADLINE_MS;
  let begin = beginExclusive;
  for (;;) {
    const stream = open(begin, (frame) => {
      if (found.frame !== undefined) return;
      frames.push(frame);
      if (isLast(frame)) {
        found.frame = frame;
        stream.close();
      }
    });
    try {
      const end = await withDeadline(stream.done, Math.max(deadline - Date.now(), 1), description);
      if (found.frame !== undefined) {
        return { frames, last: found.frame, end };
      }
      if (end.reason !== 'token-refresh') {
        throw new Error(`The stream ended (${end.reason}) at offset ${end.lastOffset} before ${description}`);
      }
      begin = end.lastOffset;
    } finally {
      stream.close();
    }
  }
}

/** The `value` of an update's `Transaction`, or `undefined` for another kind. */
function transactionValue(json: unknown): Record<string, unknown> | undefined {
  const update = isRecord(json) ? json['update'] : undefined;
  const transaction = isRecord(update) ? update['Transaction'] : undefined;
  const value = isRecord(transaction) ? transaction['value'] : undefined;
  return isRecord(value) ? value : undefined;
}

/** The `value` of a completion response's `Completion`, or `undefined` for another kind. */
function completionValue(json: unknown): Record<string, unknown> | undefined {
  const response = isRecord(json) ? json['completionResponse'] : undefined;
  const completion = isRecord(response) ? response['Completion'] : undefined;
  const value = isRecord(completion) ? completion['value'] : undefined;
  return isRecord(value) ? value : undefined;
}

/** The `CreatedEvent` of `contractId` among a transaction's events. */
function createdEventOf(transaction: Record<string, unknown> | undefined, contractId: string): Record<string, unknown> {
  const events = transaction?.['events'];
  const created = (Array.isArray(events) ? events : []).flatMap((event: unknown) => {
    const createdEvent = isRecord(event) ? event['CreatedEvent'] : undefined;
    return isRecord(createdEvent) && createdEvent['contractId'] === contractId ? [createdEvent] : [];
  });
  expect(created).toHaveLength(1);
  const [event] = created;
  if (event === undefined) {
    throw new Error(`No CreatedEvent for ${contractId}`);
  }
  return event;
}

const NUMBER_TOKEN = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/;

/**
 * The integer a JSON number token denotes, in whatever form it is written (`12`, `1.2e1`, `1e+23`), or `undefined` for
 * a non-integer. Only called on a token that already reads back as its own text, so its exponent is small.
 */
function exactInteger(token: string): bigint | undefined {
  const match = NUMBER_TOKEN.exec(token);
  if (match === null) return undefined;
  const [, sign = '', whole = '', fraction = '', exponent = '0'] = match;
  const digits = BigInt(`${whole}${fraction}`);
  const scale = Number(exponent) - fraction.length;
  let magnitude: bigint;
  if (scale >= 0) {
    magnitude = digits * 10n ** BigInt(scale);
  } else {
    const divisor = 10n ** BigInt(-scale);
    if (digits % divisor !== 0n) return undefined;
    magnitude = digits / divisor;
  }
  return sign === '-' ? -magnitude : magnitude;
}

/** Each number in a JSON text that does not read back exactly as written, as "<written> read as <held>". */
function numbersChangedByParse(text: string): { checked: number; changed: string[] } {
  const changed: string[] = [];
  let checked = 0;
  JSON.parse(text, (_key: string, value: unknown, context?: { readonly source?: string }): unknown => {
    if (typeof value === 'number' && context?.source !== undefined) {
      checked += 1;
      const { source } = context;
      if (String(value) !== source) {
        changed.push(`${source} read as ${String(value)}`);
      } else if (Number.isInteger(value)) {
        // JavaScript writes some integers it cannot hold with the digits they were written with:
        // 9223372036854775000 is held as 9223372036854774784 but written back as 9223372036854775000.
        const written = exactInteger(source);
        if (written !== undefined && BigInt(value) !== written) {
          changed.push(`${source} read as ${BigInt(value).toString()}`);
        }
      }
    }
    return value;
  });
  return { checked, changed };
}

/**
 * Asserts that every number in a JSON text reads back exactly as it is written, using the source text `JSON.parse`
 * hands to a reviver (Node 22 and later): an independent check of the SDK's lossless parsing.
 */
function expectNumbersAsWritten(text: string): void {
  const { checked, changed } = numbersChangedByParse(text);
  expect(checked).toBeGreaterThan(0);
  expect(changed).toEqual([]);
}

/** The value with the arrays under {@link UNORDERED_ARRAY_KEYS} sorted, so set order does not count as a difference. */
function withUnorderedArraysSorted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withUnorderedArraysSorted);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      UNORDERED_ARRAY_KEYS.has(key) && Array.isArray(entry)
        ? entry.map((item: unknown) => JSON.stringify(item)).sort()
        : withUnorderedArraysSorted(entry),
    ])
  );
}

/** Grants CanReadAsAnyParty to the client's user when it lacks it, and leaves it granted. */
async function ensureCanReadAsAnyParty(client: LedgerJsonApiClient): Promise<AuthenticatedUserRights> {
  const status = await getAuthenticatedUserRights(client);
  if (!status.canReadAsAnyParty) {
    await client.grantUserRights({ userId: status.userId, rights: [READ_AS_ANY_PARTY_RIGHT] });
  }
  return assertCanReadAsAnyParty(client);
}

/** A stream refused for a missing right: it ended with an error frame carrying gRPC status PERMISSION_DENIED. */
function expectStreamPermissionDenied(outcome: Outcome): void {
  const error = outcome.ok ? undefined : outcome.error;
  expect(error).toBeInstanceOf(RawStreamError);
  expect(error).toMatchObject({
    reason: 'error-frame',
    context: { frame: { grpcCodeValue: GRPC_PERMISSION_DENIED } },
  });
}

/**
 * Asks for the completions of `userId`, a user other than the client's, and expects PERMISSION_DENIED. The parties must
 * be ones the client's user may read, so that only the user id can be refused. A stream allowed after all is closed at
 * its first frame.
 */
async function expectCompletionsRefused(
  client: LedgerJsonApiClient,
  params: { readonly userId: string; readonly parties: readonly string[]; readonly beginExclusive: number }
): Promise<void> {
  const stream: RawStreamSubscription = client.subscribeToRawCompletions({
    ...params,
    onFrame: () => {
      stream.close();
    },
  });
  expectStreamPermissionDenied(await streamOutcome(stream, `the completions of user ${params.userId} to be refused`));
}

/**
 * Any-party reads by a user without CanReadAsAnyParty: the participant refuses the page with HTTP 403 and the stream
 * with a PERMISSION_DENIED error frame, refuses the active contracts while serving the same snapshot for the user's own
 * parties, and `assertCanReadAsAnyParty` names the missing right.
 *
 * @returns `false` when the reads were allowed after all because another suite granted the user the right meanwhile
 */
async function expectAnyPartyReadsRefused(client: LedgerJsonApiClient, userId: string): Promise<boolean> {
  const ownParties = [...(await explicitReadParties(client, userId))];
  expect(ownParties.length).toBeGreaterThan(0);
  const end = await readLedgerEnd(client);
  const begin = Math.max(end - 1, 0);
  const [page, stream, contracts, ownContracts, check] = await Promise.all([
    outcomeOf(
      client.getRawUpdatesPage(
        { updateFormat: ANY_PARTY_UPDATE_FORMAT, beginOffsetExclusive: begin, endOffsetInclusive: end, maxPageSize: 1 },
        { retry: { kind: 'none' } }
      )
    ),
    streamOutcome(
      client.subscribeToRawUpdates({
        updateFormat: ANY_PARTY_UPDATE_FORMAT,
        beginExclusive: begin,
        endInclusive: end,
        onFrame: () => undefined,
      }),
      'the any-party stream to end'
    ),
    outcomeOf(
      client.getActiveContracts({ anyParty: true, activeAtOffset: end, templateIds: [WALLET_APP_INSTALL_TEMPLATE_ID] })
    ),
    outcomeOf(
      client.getActiveContracts({
        parties: ownParties,
        activeAtOffset: end,
        templateIds: [WALLET_APP_INSTALL_TEMPLATE_ID],
      })
    ),
    outcomeOf(assertCanReadAsAnyParty(client)),
  ]);

  // The control: the same snapshot, with the same token at the same offset, for the parties the user has rights for.
  expect(ownContracts).toEqual({ ok: true });

  if (page.ok || stream.ok || contracts.ok || check.ok) {
    // Only a grant made while the reads ran explains an allowed read.
    const now = await getAuthenticatedUserRights(client);
    if (!now.canReadAsAnyParty) {
      throw new Error(
        `An any-party read was allowed although ledger user ${now.userId} does not hold CanReadAsAnyParty (rights: ${now.rightNames.join(', ')})`
      );
    }
    return false;
  }

  // Canton maps PERMISSION_DENIED, and nothing else, to HTTP 403.
  expect(page.error).toMatchObject({ name: 'ApiError', status: 403 });
  expectStreamPermissionDenied(stream);
  // Only the redacted cause reaches this error (see REDACTED_CAUSE_PATTERN); the own-party control above ties it to
  // the any-party scope.
  expect(describeFailure(contracts.error)).toMatch(REDACTED_CAUSE_PATTERN);
  expect(check.error).toBeInstanceOf(MissingUserRightError);
  expect(check.error).toMatchObject({ requiredRight: 'CanReadAsAnyParty' });
  return true;
}

/** Allocates a new party on the participant without granting any user a right to it. */
async function allocateUnlistedParty(
  client: LedgerJsonApiClient,
  hint: string,
  synchronizerId: string | undefined
): Promise<string> {
  const {
    partyDetails: { party },
  } = await client.allocateParty({
    partyIdHint: `${hint}-${randomUUID()}`,
    identityProviderId: '',
    synchronizerId: synchronizerId ?? '',
    // Empty: no user gets CanActAs for the new party.
    userId: '',
  });
  await retry(
    async () => {
      const details = await client.getPartyDetails({ party, identityProviderId: '' });
      if (!details.partyDetails.some((entry) => entry.party === party)) {
        throw new Error(`Party details did not include ${party}`);
      }
    },
    { timeoutMs: 60_000, description: `party ${party} visibility` }
  );
  return party;
}

/** The terms of a tiny Amulet transfer offer, tracked by its command id. */
function transferOfferTerms(commandId: string): Record<string, string | Record<string, string>> {
  return {
    amount: { amount: '0.0000001', unit: 'AmuletUnit' },
    description: 'any-party integration test',
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    trackingId: commandId,
  };
}

/** The submission's update and the `TransferOffer` it created. */
function submittedOffer(
  commandId: string,
  response: Awaited<ReturnType<LedgerJsonApiClient['submitAndWaitForTransaction']>>
): TransferOfferSubmission {
  const offer = listCreatedEvents(response).find(({ templateId }) =>
    templateId.includes(TRANSFER_OFFER_TEMPLATE_SUFFIX)
  );
  const dso = offer?.createArgument['dso'];
  if (offer === undefined || typeof dso !== 'string') {
    throw new Error(`Command ${commandId} created no TransferOffer that names a DSO party`);
  }
  const { updateId, offset } = response.transaction;
  return { commandId, updateId, offset, contractId: offer.contractId, dso };
}

/** Offers a tiny Amulet transfer from the validator's wallet to `receiver`, creating a `TransferOffer`. */
async function submitTransferOffer(
  client: LedgerJsonApiClient,
  params: {
    readonly submitter: string;
    readonly receiver: string;
    readonly walletAppInstallContractId: string;
    readonly synchronizerId: string | undefined;
  }
): Promise<TransferOfferSubmission> {
  const commandId = `any-party-it-${randomUUID()}`;
  const response = await client.submitAndWaitForTransaction({
    commandId,
    actAs: [params.submitter],
    ...(params.synchronizerId !== undefined ? { synchronizerId: params.synchronizerId } : {}),
    commands: [
      {
        ExerciseCommand: {
          templateId: WALLET_APP_INSTALL_TEMPLATE_ID,
          contractId: params.walletAppInstallContractId,
          choice: 'WalletAppInstall_CreateTransferOffer',
          choiceArgument: { receiver: params.receiver, ...transferOfferTerms(commandId) },
        },
      },
    ],
  });
  return submittedOffer(commandId, response);
}

/**
 * `sender` creates a tiny Amulet `TransferOffer` to `receiver` directly. The sender is its only signatory, so the
 * create needs no wallet, and nothing reacts to an offer between parties that have none.
 */
async function createTransferOffer(
  client: LedgerJsonApiClient,
  params: {
    readonly sender: string;
    readonly receiver: string;
    readonly dso: string;
    readonly synchronizerId: string | undefined;
  }
): Promise<TransferOfferSubmission> {
  const commandId = `any-party-it-${randomUUID()}`;
  const response = await client.submitAndWaitForTransaction({
    commandId,
    actAs: [params.sender],
    ...(params.synchronizerId !== undefined ? { synchronizerId: params.synchronizerId } : {}),
    commands: [
      {
        CreateCommand: {
          templateId: TRANSFER_OFFER_TEMPLATE_ID,
          createArguments: {
            sender: params.sender,
            receiver: params.receiver,
            dso: params.dso,
            ...transferOfferTerms(commandId),
          },
        },
      },
    ],
  });
  return submittedOffer(commandId, response);
}

/** The validator's wallet offers a transfer to a new party that no user has a right to. */
async function createActivity(client: LedgerJsonApiClient): Promise<Activity> {
  const { userId } = await getAuthenticatedUserRights(client);
  const submitter = await resolveValidatorPartyId();
  const { contractId: walletAppInstallContractId, synchronizerId } = await resolveWalletAppInstallContext(
    client,
    submitter
  );
  const receiver = await allocateUnlistedParty(client, 'any-party-receiver', synchronizerId);
  const beginExclusive = await readLedgerEnd(client);
  const submission = await submitTransferOffer(client, {
    submitter,
    receiver,
    walletAppInstallContractId,
    synchronizerId,
  });
  console.info(
    `Any-party activity: ${submitter} offered ${receiver} a transfer in update ${submission.updateId} at offset ${submission.offset} (contract ${submission.contractId})`
  );
  return {
    ...submission,
    userId,
    submitter,
    receiver,
    beginExclusive,
    walletAppInstallContractId,
    synchronizerId,
  };
}

/** The raw page of the single offset `offset` read as every party, and its one update. */
async function readPageAt(
  client: LedgerJsonApiClient,
  offset: number
): Promise<{ readonly page: RawUpdatesPage; readonly update: RawPageUpdate }> {
  const page = await client.getRawUpdatesPage({
    updateFormat: ANY_PARTY_UPDATE_FORMAT,
    beginOffsetExclusive: offset - 1,
    endOffsetInclusive: offset,
    maxPageSize: 10,
  });
  expect(page.updates).toHaveLength(1);
  const [update] = page.updates;
  if (update === undefined) {
    throw new Error(`The page at offset ${offset} has no update`);
  }
  return { page, update };
}

async function readUpdatesUntil(
  client: LedgerJsonApiClient,
  beginExclusive: number,
  isLast: (frame: RawUpdateFrame) => boolean,
  description: string
): Promise<RawRead<RawUpdateFrame>> {
  return readRawUntil<RawUpdateFrame>(
    (begin, onFrame) =>
      client.subscribeToRawUpdates({ updateFormat: ANY_PARTY_UPDATE_FORMAT, beginExclusive: begin, onFrame }),
    beginExclusive,
    isLast,
    description
  );
}

/** Each active contract's witness parties, by contract id. */
async function witnessesByContract(stream: ActiveContractsStream): Promise<Map<string, readonly string[]>> {
  const witnesses = new Map<string, readonly string[]>();
  for await (const item of stream) {
    const entry = item.contractEntry;
    if ('JsActiveContract' in entry) {
      const { contractId, witnessParties } = entry.JsActiveContract.createdEvent;
      witnesses.set(contractId, witnessParties);
    }
  }
  return witnesses;
}

/** The parties the user's explicit CanActAs and CanReadAs rights name. */
async function explicitReadParties(client: LedgerJsonApiClient, userId: string): Promise<Set<string>> {
  const { rights = [] } = await client.listUserRights({ userId });
  const parties = new Set<string>();
  for (const { kind } of rights) {
    if (kind !== undefined && 'CanActAs' in kind) {
      parties.add(kind.CanActAs.value.party);
    } else if (kind !== undefined && 'CanReadAs' in kind) {
      parties.add(kind.CanReadAs.value.party);
    }
  }
  return parties;
}

describe('LedgerJsonApiClient / Any-party reads', () => {
  test('the independent number check catches every number JSON.parse rounds or rewrites', () => {
    // No ledger needed: this proves the check the page and stream assertions rely on can fail.
    expect(numbersChangedByParse('[9223372036854775000, 1e+23, 9007199254740993, 1.0, 1e3]').changed).toEqual([
      '9223372036854775000 read as 9223372036854774784',
      '1e+23 read as 99999999999999991611392',
      '9007199254740993 read as 9007199254740992',
      '1.0 read as 1',
      '1e3 read as 1000',
    ]);
    expect(numbersChangedByParse('[0, -12, 3342, 9007199254740991, 1e+21, 1.5, -0.25]')).toEqual({
      checked: 7,
      changed: [],
    });
  });

  test(
    "refuses any-party reads and another user's completions to a user without CanReadAsAnyParty on the app-user participant",
    async () => {
      // The app-user validator never holds CanReadAsAnyParty (contract-by-id.test.ts relies on that too), so this
      // control runs on every LocalNet, whatever rights the app-provider user already has.
      const client = new LedgerJsonApiClient(new CantonRuntime({ network: 'localnet', provider: 'app-user' }));
      const rights = await getAuthenticatedUserRights(client);
      if (rights.canReadAsAnyParty) {
        console.info(
          `Ledger user ${rights.userId} on the app-user participant holds CanReadAsAnyParty; control skipped`
        );
        return;
      }
      expect(await expectAnyPartyReadsRefused(client, rights.userId)).toBe(true);

      // Completions of a user id other than its own, for parties it may read: only the user id can be refused.
      await expectCompletionsRefused(client, {
        userId: `any-party-it-other-user-${randomUUID()}`,
        parties: [...(await explicitReadParties(client, rights.userId))],
        beginExclusive: await readLedgerEnd(client),
      });
    },
    TEST_TIMEOUT_MS
  );

  test(
    'refuses any-party reads without CanReadAsAnyParty, then allows them once it is granted',
    async () => {
      const client = getClient();
      const before = await getAuthenticatedUserRights(client);
      if (before.canReadAsAnyParty) {
        console.info(
          `Ledger user ${before.userId} already holds CanReadAsAnyParty (${before.rightNames.join(', ')}); negative control skipped`
        );
      } else {
        if (!(await expectAnyPartyReadsRefused(client, before.userId))) {
          console.info(`Another suite granted ${before.userId} CanReadAsAnyParty during the negative control`);
        }
        // Left granted: test files run in parallel and their reads with this user never depend on lacking it.
        await client.grantUserRights({ userId: before.userId, rights: [READ_AS_ANY_PARTY_RIGHT] });
      }

      const after = await assertCanReadAsAnyParty(client);
      expect(after.userId).toBe(before.userId);
      expect(after.canReadAsAnyParty).toBe(true);
      expect(after.rightNames).toContain('CanReadAsAnyParty');

      const end = await readLedgerEnd(client);
      const page = await client.getRawUpdatesPage({
        updateFormat: ANY_PARTY_UPDATE_FORMAT,
        beginOffsetExclusive: Math.max(end - 1, 0),
        endOffsetInclusive: end,
        maxPageSize: 1,
      });
      expect(page.highestPageOffsetInclusive).toBe(end);
    },
    TEST_TIMEOUT_MS
  );

  describe('known activity', () => {
    let activity: Activity;

    beforeAll(async () => {
      const client = getClient();
      await ensureCanReadAsAnyParty(client);
      activity = await createActivity(client);
    }, TEST_TIMEOUT_MS);

    test(
      'getRawUpdatesPage returns the update exactly as sent, with the unlisted party as a witness',
      async () => {
        const { page, update } = await readPageAt(getClient(), activity.offset);

        // A bounded first page: its bounds are the request's, and it is the last one.
        expect(page.lowestPageOffsetExclusive).toBe(activity.offset - 1);
        expect(page.highestPageOffsetInclusive).toBe(activity.offset);
        expect(page.nextPageToken).toBeUndefined();
        expect(update).toMatchObject({ kind: 'Transaction', offset: activity.offset });
        const transaction = transactionValue(update.json);
        expect(transaction).toMatchObject({
          updateId: activity.updateId,
          commandId: activity.commandId,
          offset: activity.offset,
        });
        const offer = createdEventOf(transaction, activity.contractId);
        expect(offer['witnessParties']).toEqual(expect.arrayContaining([activity.receiver]));

        // Each item is a slice of the page text that parses to the page's own element (`item.json` is that element).
        for (const item of page.updates) {
          expect(page.text).toContain(item.text);
          expect(JSON.parse(item.text)).toEqual(item.json);
        }

        expectNumbersAsWritten(page.text);
        expectNumbersAsWritten(update.text);
        const paidTrafficCost = transaction?.['paidTrafficCost'];
        if (typeof paidTrafficCost === 'number') {
          expect(Number.isSafeInteger(paidTrafficCost)).toBe(true);
          expect(update.text).toContain(`"paidTrafficCost":${paidTrafficCost}`);
        }
        console.info(
          `Raw page item of update ${activity.updateId}: ${update.text.length} bytes, paidTrafficCost ${
            typeof paidTrafficCost === 'number' ? paidTrafficCost : 'absent'
          }`
        );
      },
      TEST_TIMEOUT_MS
    );

    test(
      'subscribeToRawUpdates delivers the page update, closes, and resumes after it without a repeat',
      async () => {
        const client = getClient();
        const { page, update: pageItem } = await readPageAt(client, activity.offset);

        const first = await readUpdatesUntil(
          client,
          activity.offset - 1,
          (frame) => frame.kind === 'Transaction' && frame.offset === activity.offset,
          `update ${activity.updateId}`
        );
        // Closed from inside onFrame: lastOffset is that frame's offset, the page's upper bound.
        expect(first.end.reason).toBe('closed');
        expect(first.end.lastOffset).toBe(activity.offset);
        expect(first.end.lastOffset).toBe(page.highestPageOffsetInclusive);

        const frame = first.last;
        expect(transactionValue(frame.json)).toMatchObject({ updateId: activity.updateId, offset: activity.offset });
        expect(JSON.parse(frame.text)).toEqual(frame.json);
        expectNumbersAsWritten(frame.text);
        // The page and the stream read the update through the same buffered updates reader and write it with the same
        // Transaction.toJson, so the frame is the page item byte for byte. Only an eviction from the in-memory fan-out
        // buffer (200 updates on LocalNet) between two reads could make them differ, as the index database may list
        // set-valued party arrays in another order; the content must agree regardless. The frame was read between two
        // page reads, so it came from the same source as at least one of them.
        const { update: pageItemAfter } = await readPageAt(client, activity.offset);
        expect(withUnorderedArraysSorted(frame.json)).toEqual(withUnorderedArraysSorted(pageItem.json));
        expect([pageItem.text, pageItemAfter.text]).toContain(frame.text);
        console.info(
          `Raw stream frame of update ${activity.updateId}: byte-identical to the page item read ${
            frame.text === pageItem.text ? 'before the stream' : 'after the stream only'
          }`
        );

        // Something to resume to: a second offer, after the first stream has closed.
        const marker = await submitTransferOffer(client, activity);
        expect(marker.offset).toBeGreaterThan(first.end.lastOffset);
        const resumed = await readUpdatesUntil(
          client,
          first.end.lastOffset,
          (next) => next.kind === 'Transaction' && transactionValue(next.json)?.['updateId'] === marker.updateId,
          `update ${marker.updateId}`
        );
        expect(resumed.end.reason).toBe('closed');
        expect(resumed.end.lastOffset).toBe(marker.offset);
        const repeated = resumed.frames
          .filter(
            (next) =>
              (next.kind !== 'OffsetCheckpoint' && next.offset !== undefined && next.offset <= first.end.lastOffset) ||
              next.text.includes(activity.updateId)
          )
          .map((next) => `${next.kind}@${String(next.offset)}`);
        expect(repeated).toEqual([]);
      },
      TEST_TIMEOUT_MS
    );

    test(
      'active contracts as every party include the offer, witnessed by a party with no user right',
      async () => {
        const client = getClient();
        const activeAtOffset = await readLedgerEnd(client);

        const offers = await client.getActiveContracts({
          anyParty: true,
          activeAtOffset,
          templateIds: [TRANSFER_OFFER_TEMPLATE_ID],
        });
        const offer = offers.flatMap((item) =>
          'JsActiveContract' in item.contractEntry &&
          item.contractEntry.JsActiveContract.createdEvent.contractId === activity.contractId
            ? [item.contractEntry.JsActiveContract.createdEvent]
            : []
        );
        expect(offer).toHaveLength(1);
        expect(offer[0]?.witnessParties).toEqual(expect.arrayContaining([activity.receiver]));

        const stream = client.streamActiveContracts({ anyParty: true, activeAtOffset });
        const everyParty = await witnessesByContract(stream);
        expect(stream.activeAtOffset).toBe(activeAtOffset);
        expect(everyParty.get(activity.contractId)).toEqual(expect.arrayContaining([activity.receiver]));

        // Breadth: the explicit rights' parties see a subset of it, and miss the unlisted receiver.
        const explicitParties = await explicitReadParties(client, activity.userId);
        expect(explicitParties.has(activity.submitter)).toBe(true);
        expect(explicitParties.has(activity.receiver)).toBe(false);
        const listed = await witnessesByContract(
          client.streamActiveContracts({ parties: [...explicitParties], activeAtOffset })
        );
        expect([...listed.keys()].filter((contractId) => !everyParty.has(contractId))).toEqual([]);
        expect(listed.get(activity.contractId) ?? []).not.toContain(activity.receiver);

        const witnesses = new Set([...everyParty.values()].flat());
        const unlisted = [...witnesses].filter((party) => !explicitParties.has(party));
        console.info(
          `Active contracts at offset ${activeAtOffset}: ${everyParty.size} as every party, ${listed.size} as the ${explicitParties.size} parties of explicit rights; ${unlisted.length} of ${witnesses.size} witness parties hold no explicit right`
        );
        // This test allocated the receiver and granted no right to it, so at least it is outside the explicit rights.
        expect(unlisted).toContain(activity.receiver);
      },
      TEST_TIMEOUT_MS
    );

    test(
      "subscribeToRawCompletions delivers the submission's completion to its user and party",
      async () => {
        const client = getClient();
        const read = await readRawUntil<RawCompletionFrame>(
          (beginExclusive, onFrame) =>
            client.subscribeToRawCompletions({
              userId: activity.userId,
              parties: [activity.submitter],
              beginExclusive,
              onFrame,
            }),
          activity.beginExclusive,
          (frame) => completionValue(frame.json)?.['commandId'] === activity.commandId,
          `the completion of command ${activity.commandId}`
        );
        expect(read.end.reason).toBe('closed');
        expect(read.end.lastOffset).toBe(activity.offset);

        const frame = read.last;
        expect(frame).toMatchObject({ kind: 'Completion', offset: activity.offset });
        expect(JSON.parse(frame.text)).toEqual(frame.json);
        expectNumbersAsWritten(frame.text);
        const completion = completionValue(frame.json);
        expect(completion).toMatchObject({
          commandId: activity.commandId,
          userId: activity.userId,
          updateId: activity.updateId,
          offset: activity.offset,
        });
        expect(completion?.['actAs']).toEqual(expect.arrayContaining([activity.submitter]));
        const status = completion?.['status'];
        if (status !== undefined) {
          expect(status).toMatchObject({ code: 0 });
        }
        const paidTrafficCost = completion?.['paidTrafficCost'];
        if (typeof paidTrafficCost === 'number') {
          expect(Number.isSafeInteger(paidTrafficCost)).toBe(true);
          expect(paidTrafficCost).toBeGreaterThanOrEqual(0);
          expect(frame.text).toContain(`"paidTrafficCost":${paidTrafficCost}`);
        }
        console.info(
          `Raw completion of command ${activity.commandId}: paidTrafficCost ${
            typeof paidTrafficCost === 'number' ? paidTrafficCost : 'absent'
          }`
        );
      },
      TEST_TIMEOUT_MS
    );

    test(
      "subscribeToRawCompletions gives another user's completion to a CanReadAsAnyParty holder and refuses it without",
      async () => {
        const reader = getClient();
        const other = await getLocalnetNonAdminLedgerClient();
        const otherRights = await getAuthenticatedUserRights(other);
        expect(otherRights.userId).not.toBe(activity.userId);

        // A new party that only the other user may act as, so its submission's completion belongs to that user alone.
        // No other test knows the party, so revoking the right afterwards cannot disturb one.
        const sender = await allocateUnlistedParty(reader, 'any-party-other-sender', activity.synchronizerId);
        const actAsSender = { kind: { CanActAs: { value: { party: sender } } } } as const;
        await reader.grantUserRights({ userId: otherRights.userId, rights: [actAsSender] });
        try {
          const beginExclusive = await readLedgerEnd(reader);
          const offer = await createTransferOffer(other, {
            sender,
            receiver: activity.receiver,
            dso: activity.dso,
            synchronizerId: activity.synchronizerId,
          });
          const readCompletion = async (
            client: LedgerJsonApiClient,
            userId: string
          ): Promise<RawRead<RawCompletionFrame>> =>
            readRawUntil<RawCompletionFrame>(
              (begin, onFrame) =>
                client.subscribeToRawCompletions({ userId, parties: [sender], beginExclusive: begin, onFrame }),
              beginExclusive,
              (frame) => completionValue(frame.json)?.['commandId'] === offer.commandId,
              `the completion of command ${offer.commandId} on the stream of user ${userId}`
            );

          if (otherRights.canReadAsAnyParty) {
            console.info(
              `Ledger user ${otherRights.userId} holds CanReadAsAnyParty; the cross-user refusal was skipped`
            );
          } else {
            // Without the right, on the same party: its own completion is served, another user's is refused.
            const own = await readCompletion(other, otherRights.userId);
            expect(completionValue(own.last.json)).toMatchObject({
              commandId: offer.commandId,
              userId: otherRights.userId,
            });
            await expectCompletionsRefused(other, { userId: activity.userId, parties: [sender], beginExclusive });
          }

          // With the right, the reader gets the other user's completion, though none of its explicit rights names the
          // party.
          const read = await readCompletion(reader, otherRights.userId);
          expect(read.end.reason).toBe('closed');
          expect(read.end.lastOffset).toBe(offer.offset);
          const frame = read.last;
          expect(frame).toMatchObject({ kind: 'Completion', offset: offer.offset });
          expect(JSON.parse(frame.text)).toEqual(frame.json);
          expectNumbersAsWritten(frame.text);
          expect(completionValue(frame.json)).toMatchObject({
            commandId: offer.commandId,
            userId: otherRights.userId,
            updateId: offer.updateId,
            offset: offer.offset,
            actAs: [sender],
          });
          console.info(
            `Ledger user ${activity.userId} read the completion of command ${offer.commandId} by user ${otherRights.userId} at offset ${offer.offset}`
          );
        } finally {
          await reader.revokeUserRights({ userId: otherRights.userId, rights: [actAsSender] });
        }
      },
      TEST_TIMEOUT_MS
    );
  });
});
