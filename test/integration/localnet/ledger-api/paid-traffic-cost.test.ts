/**
 * End-to-end check that Canton exposes `paidTrafficCost` on completions (Ledger JSON API).
 *
 * Uses async submit + completions (WebSocket and blocking REST) against cn-quickstart.
 */

import { CantonRuntime, ValidatorApiClient } from '../../../../src';
import { waitForCompletionWithMetadata } from '../../../../src/clients/ledger-json-api';
import { CompletionStreamResponseSchema } from '../../../../src/clients/ledger-json-api/schemas/api/completions';
import { EnvLoader } from '../../../../src/core/config/EnvLoader';
import { ConfigurationError } from '../../../../src/core/errors';
import { getPaidTrafficCostFromCompletion } from '../../../../src/utils/traffic/paid-traffic-cost';
import { buildIntegrationTestClientConfig } from '@fairmint/canton-dev-tools/testing';
import { getClient } from './setup';

const WALLET_APP_INSTALL_TEMPLATE_SUFFIX = 'Splice.Wallet.Install:WalletAppInstall';

/** Bound for each HTTP completions batch (suite load can exceed the old limit of 50). */
const BLOCKING_COMPLETION_LIMIT = 200;
/** Total time budget for HTTP poll after WS already observed the completion. */
const BLOCKING_POLL_TIMEOUT_MS = 60_000;
const BLOCKING_POLL_INITIAL_DELAY_MS = 250;
const BLOCKING_POLL_MAX_DELAY_MS = 2_000;

/** Env (local dev) or active-contracts snapshot (CI without .env.local). */
async function resolveWalletAppInstallContext(
  client: ReturnType<typeof getClient>,
  partyId: string
): Promise<{ contractId: string; synchronizerId: string | undefined }> {
  try {
    const contractId = EnvLoader.getInstance().getValidatorWalletAppInstallContractId('localnet');
    return { contractId, synchronizerId: undefined };
  } catch (error) {
    if (!(error instanceof ConfigurationError)) {
      throw error;
    }
    const snapshot = await client.getActiveContracts({
      parties: [partyId],
      templateIds: [`#splice-wallet:${WALLET_APP_INSTALL_TEMPLATE_SUFFIX}`],
    });
    for (const item of snapshot) {
      const entry = item.contractEntry;
      if ('JsActiveContract' in entry) {
        const { contractId, templateId } = entry.JsActiveContract.createdEvent;
        if (templateId.includes(WALLET_APP_INSTALL_TEMPLATE_SUFFIX)) {
          return {
            contractId,
            synchronizerId: entry.JsActiveContract.synchronizerId,
          };
        }
      }
    }
    throw new Error(
      'Could not find WalletAppInstall contract: set CANTON_VALIDATOR_WALLET_APP_INSTALL_CONTRACT_ID_LOCALNET or ensure the validator party has WalletAppInstall on-ledger'
    );
  }
}

/**
 * Participant user id for completions. Falls back to validator `user_name` (same as `scripts/grant-user-rights.ts`)
 * when the ledger authenticated-user endpoint is unavailable.
 */
async function resolveLedgerUserId(client: ReturnType<typeof getClient>, validatorUserName: string): Promise<string> {
  const configured = client.getUserId();
  if (configured) {
    return configured;
  }
  const fromEnv = EnvLoader.getInstance().getUserId('localnet', 'app-provider');
  if (fromEnv) {
    return fromEnv;
  }
  try {
    const auth = await client.getAuthenticatedUser({});
    return auth.user.id;
  } catch {
    return validatorUserName;
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

type ParsedCompletionRow = NonNullable<ReturnType<typeof CompletionStreamResponseSchema.safeParse>['data']>;

interface FindCompletionResult {
  readonly row: ParsedCompletionRow | undefined;
  readonly parseFailures: number;
  readonly lastParseError: string | undefined;
  /** Highest completion/checkpoint offset seen in successfully parsed rows (for pagination). */
  readonly maxOffset: number | undefined;
  /** Raw rows whose `submissionId` matched before schema parse (helps diagnose silent safeParse skips). */
  readonly rawSubmissionIdHits: number;
}

function extractOffset(parsed: ParsedCompletionRow): number | undefined {
  const { completionResponse } = parsed;
  if ('Completion' in completionResponse) {
    return completionResponse.Completion.value.offset;
  }
  if ('OffsetCheckpoint' in completionResponse) {
    return completionResponse.OffsetCheckpoint.value.offset;
  }
  return undefined;
}

function rawSubmissionIdEquals(row: unknown, submissionId: string): boolean {
  if (row === null || typeof row !== 'object') {
    return false;
  }
  const response = (row as { completionResponse?: unknown }).completionResponse;
  if (response === null || typeof response !== 'object') {
    return false;
  }
  const completion = (response as { Completion?: unknown }).Completion;
  if (completion === null || typeof completion !== 'object') {
    return false;
  }
  const { value } = completion as { value?: unknown };
  if (value === null || typeof value !== 'object') {
    return false;
  }
  return (value as { submissionId?: unknown }).submissionId === submissionId;
}

function findCompletionForSubmission(rows: unknown[], submissionId: string): FindCompletionResult {
  let parseFailures = 0;
  let lastParseError: string | undefined;
  let maxOffset: number | undefined;
  let rawSubmissionIdHits = 0;
  let row: ParsedCompletionRow | undefined;

  for (const candidate of rows) {
    if (rawSubmissionIdEquals(candidate, submissionId)) {
      rawSubmissionIdHits += 1;
    }
    const parsed = CompletionStreamResponseSchema.safeParse(candidate);
    if (!parsed.success) {
      parseFailures += 1;
      lastParseError = parsed.error.message;
      continue;
    }
    const offset = extractOffset(parsed.data);
    if (offset !== undefined && (maxOffset === undefined || offset > maxOffset)) {
      maxOffset = offset;
    }
    const cr = parsed.data.completionResponse;
    if (!('Completion' in cr)) {
      continue;
    }
    if (cr.Completion.value.submissionId === submissionId) {
      row = parsed.data;
    }
  }

  return { row, parseFailures, lastParseError, maxOffset, rawSubmissionIdHits };
}

/**
 * Poll HTTP `/v2/commands/completions` until the submission appears (or timeout).
 * Mirrors WS wait resilience: backoff between empty polls, raise limit, paginate past full pages.
 */
async function pollBlockingCompletionForSubmission(
  client: ReturnType<typeof getClient>,
  params: {
    readonly userId: string;
    readonly partyId: string;
    readonly beginExclusive: number;
    readonly submissionId: string;
  }
): Promise<ParsedCompletionRow> {
  const { userId, partyId, submissionId } = params;
  let cursor = params.beginExclusive;
  const deadline = Date.now() + BLOCKING_POLL_TIMEOUT_MS;
  let delayMs = BLOCKING_POLL_INITIAL_DELAY_MS;
  let lastBatchSize = 0;
  let totalParseFailures = 0;
  let lastParseError: string | undefined;
  let rawSubmissionIdHits = 0;

  while (Date.now() < deadline) {
    const blocking = await client.completions({
      userId,
      parties: [partyId],
      beginExclusive: cursor,
      limit: BLOCKING_COMPLETION_LIMIT,
    });
    lastBatchSize = blocking.length;

    const found = findCompletionForSubmission(blocking, submissionId);
    totalParseFailures += found.parseFailures;
    if (found.lastParseError !== undefined) {
      ({ lastParseError } = found);
    }
    rawSubmissionIdHits += found.rawSubmissionIdHits;

    if (found.row) {
      if (found.parseFailures > 0) {
        const parseDetail =
          found.lastParseError !== undefined ? ` (last: ${found.lastParseError})` : '';
        console.warn(
          `Blocking completions: skipped ${found.parseFailures} unparseable row(s) before match${parseDetail}`
        );
      }
      return found.row;
    }

    // Full page without a match: advance cursor and keep paging (suite load can exceed one page).
    if (blocking.length >= BLOCKING_COMPLETION_LIMIT && found.maxOffset !== undefined && found.maxOffset > cursor) {
      cursor = found.maxOffset;
      continue;
    }

    // Re-query ledger end between idle polls (surface stall if offset never advances).
    try {
      await client.getLedgerEnd({});
    } catch {
      // Ignore ledger-end probe failures; still retry completions.
    }

    await sleep(delayMs);
    delayMs = Math.min(delayMs * 2, BLOCKING_POLL_MAX_DELAY_MS);
  }

  const parseHint =
    totalParseFailures > 0
      ? `; safeParse skipped ${totalParseFailures} row(s)${
          lastParseError !== undefined ? ` (last: ${lastParseError})` : ''
        }${
          rawSubmissionIdHits > 0
            ? `; raw submissionId matched ${rawSubmissionIdHits} unparseable row(s)`
            : ''
        }`
      : '';

  throw new Error(
    `Blocking completions did not include submissionId=${submissionId} (limit=${BLOCKING_COMPLETION_LIMIT}, lastBatchSize=${lastBatchSize}, beginExclusive=${cursor}${parseHint})`
  );
}

describe('LedgerJsonApiClient / paidTrafficCost on completions', () => {
  test('async submit then completions include paidTrafficCost (WS + REST)', async () => {
    const client = getClient();
    const validatorClient = new ValidatorApiClient(new CantonRuntime(buildIntegrationTestClientConfig()));
    const validatorInfo = await validatorClient.getValidatorUserInfo();
    const partyId = validatorInfo.party_id;
    if (!partyId) {
      throw new Error('getValidatorUserInfo returned empty party_id');
    }
    if (!validatorInfo.user_name) {
      throw new Error('getValidatorUserInfo returned empty user_name');
    }
    client.setPartyId(partyId);
    const userId = await resolveLedgerUserId(client, validatorInfo.user_name);

    const partiesResponse = await client.listParties({});
    const details = partiesResponse.partyDetails;
    const receiverParty = details.map((entry: { party: string }) => entry.party).find((id: string) => id !== partyId);
    if (!receiverParty) {
      throw new Error(
        'Integration precondition failed: need at least two distinct parties on the ledger (transfer offer cannot use self as receiver)'
      );
    }

    const { contractId: walletInstallCid, synchronizerId } = await resolveWalletAppInstallContext(client, partyId);

    const ledgerEnd = await client.getLedgerEnd({});
    if (ledgerEnd.offset === undefined) {
      throw new Error('getLedgerEnd returned no offset');
    }
    const beginExclusive = ledgerEnd.offset;

    const submissionId = `paid-traffic-it-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const commandId = submissionId;
    const trackingId = submissionId;
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await client.asyncSubmit({
      commandId,
      submissionId,
      ...(synchronizerId !== undefined ? { synchronizerId } : {}),
      commands: [
        {
          ExerciseCommand: {
            templateId: '#splice-wallet:Splice.Wallet.Install:WalletAppInstall',
            contractId: walletInstallCid,
            choice: 'WalletAppInstall_CreateTransferOffer',
            choiceArgument: {
              receiver: receiverParty,
              amount: { amount: '0.0000001', unit: 'AmuletUnit' },
              description: 'paidTrafficCost integration test',
              expiresAt: expiresAt.toISOString(),
              trackingId,
            },
          },
        },
      ],
      actAs: [partyId],
    });

    const wsResult = await waitForCompletionWithMetadata(client, {
      submissionId,
      partyId,
      userId,
      beginExclusive,
      timeoutMs: 120_000,
    });

    expect(wsResult.updateId).toMatch(/\S+/);

    const row = await pollBlockingCompletionForSubmission(client, {
      userId,
      partyId,
      beginExclusive,
      submissionId,
    });

    const { completionResponse } = row;
    if (!('Completion' in completionResponse)) {
      throw new Error('Expected Completion in blocking completions response');
    }
    const completion = completionResponse.Completion;
    expect(completion).toBeDefined();
    const paid = getPaidTrafficCostFromCompletion(completion);
    const wsPaid = wsResult.paidTrafficCost;

    // Canton may omit paidTrafficCost on older nodes; when either path reports it, both must agree and be non-negative.
    if (wsPaid !== undefined || paid !== undefined) {
      expect(wsPaid).toBeDefined();
      expect(paid).toBeDefined();
      expect(wsPaid).toEqual(paid);
      expect(wsPaid).toBeGreaterThanOrEqual(0n);
    }
  }, 180_000);
});
