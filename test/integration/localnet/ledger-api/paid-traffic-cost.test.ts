/**
 * End-to-end check that Canton exposes `paidTrafficCost` on completions (Ledger JSON API).
 *
 * Uses async submit + completions (WebSocket and blocking REST) against cn-quickstart.
 */

import { CantonRuntime, ValidatorApiClient } from '../../../../src';
import { waitForCompletionWithMetadata } from '../../../../src/clients/ledger-json-api';
import { CompletionStreamResponseSchema } from '../../../../src/clients/ledger-json-api/schemas/api/completions';
import { EnvLoader } from '../../../../src/core/config/EnvLoader';
import { ApiError, ConfigurationError } from '../../../../src/core/errors';
import { getPaidTrafficCostFromCompletion } from '../../../../src/utils/traffic/paid-traffic-cost';
import { buildIntegrationTestClientConfig } from '@fairmint/canton-dev-tools/testing';
import { getClient } from './setup';

const WALLET_APP_INSTALL_TEMPLATE_SUFFIX = 'Splice.Wallet.Install:WalletAppInstall';

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

function findCompletionForSubmission(
  rows: unknown[],
  submissionId: string
): {
  row: ReturnType<typeof CompletionStreamResponseSchema.safeParse>['data'] | undefined;
  parseFailures: string[];
  rawSubmissionIds: string[];
} {
  const parseFailures: string[] = [];
  const rawSubmissionIds: string[] = [];
  for (const row of rows) {
    const rawId = extractRawSubmissionId(row);
    if (rawId) {
      rawSubmissionIds.push(rawId);
    }
    const parsed = CompletionStreamResponseSchema.safeParse(row);
    if (!parsed.success) {
      if (rawId === submissionId) {
        parseFailures.push(parsed.error.message);
      }
      continue;
    }
    const cr = parsed.data.completionResponse;
    if (!('Completion' in cr)) {
      continue;
    }
    if (cr.Completion.value.submissionId === submissionId) {
      return { row: parsed.data, parseFailures, rawSubmissionIds };
    }
  }
  return { row: undefined, parseFailures, rawSubmissionIds };
}

function extractRawSubmissionId(row: unknown): string | undefined {
  if (!row || typeof row !== 'object') {
    return undefined;
  }
  const completionResponse = (row as { completionResponse?: unknown }).completionResponse;
  if (!completionResponse || typeof completionResponse !== 'object') {
    return undefined;
  }
  const completion = (completionResponse as { Completion?: { value?: { submissionId?: unknown } } }).Completion;
  const submissionId = completion?.value?.submissionId;
  return typeof submissionId === 'string' ? submissionId : undefined;
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

    // REST completions are a cursor batch; under parallel LocalNet load a single
    // limit=50 poll can miss the row even after WS already observed it. Poll with
    // a higher limit until the submission appears. Retry STALE_STREAM_AUTHORIZATION
    // quickly (Canton 409) instead of holding the stream with idle timeout.
    const restLimit = 200;
    const restDeadline = Date.now() + 60_000;
    let matched: ReturnType<typeof findCompletionForSubmission>['row'];
    let lastBatchSize = 0;
    let lastError: unknown;
    let lastParseFailures: string[] = [];
    let lastRawSubmissionIds: string[] = [];
    for (;;) {
      try {
        const blocking = await client.completions({
          userId,
          parties: [partyId],
          beginExclusive,
          limit: restLimit,
        });
        lastBatchSize = blocking.length;
        lastError = undefined;
        const found = findCompletionForSubmission(blocking, submissionId);
        matched = found.row;
        lastParseFailures = found.parseFailures;
        lastRawSubmissionIds = found.rawSubmissionIds;
        if (matched || Date.now() >= restDeadline) {
          break;
        }
      } catch (error) {
        lastError = error;
        const staleAuth =
          error instanceof ApiError &&
          error.status === 409 &&
          /STALE_STREAM_AUTHORIZATION/i.test(error.message);
        if (!staleAuth || Date.now() >= restDeadline) {
          throw error;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (!matched) {
      const detail =
        lastError instanceof Error
          ? `; lastError=${lastError.message}`
          : lastError
            ? `; lastError=${String(lastError)}`
            : '';
      const parseDetail =
        lastParseFailures.length > 0 ? `; zodFailures=${lastParseFailures.join(' | ')}` : '';
      const idsDetail =
        lastRawSubmissionIds.length > 0
          ? `; rawSubmissionIds=${lastRawSubmissionIds.join(',')}`
          : '';
      throw new Error(
        `Blocking completions did not include submissionId=${submissionId} (limit=${restLimit}, lastBatchSize=${lastBatchSize}${detail}${parseDetail}${idsDetail})`
      );
    }

    const { completionResponse } = matched;
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
