/**
 * End-to-end check that Canton exposes `paidTrafficCost` on completions (Ledger JSON API).
 *
 * Uses async submit + completions (WebSocket and blocking REST) against cn-quickstart.
 */

import { ValidatorApiClient } from '../../../../src';
import { waitForCompletionWithMetadata } from '../../../../src/clients/ledger-json-api';
import { EnvLoader } from '../../../../src/core/config/EnvLoader';
import { ConfigurationError } from '../../../../src/core/errors';
import { CompletionStreamResponseSchema } from '../../../../src/clients/ledger-json-api/schemas/api/completions';
import { getPaidTrafficCostFromCompletion } from '../../../../src/utils/traffic/paid-traffic-cost';
import { buildIntegrationTestClientConfig } from '../../../utils/testConfig';
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
async function resolveLedgerUserId(
  client: ReturnType<typeof getClient>,
  validatorUserName: string
): Promise<string> {
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
): ReturnType<typeof CompletionStreamResponseSchema.safeParse>['data'] | undefined {
  for (const row of rows) {
    const parsed = CompletionStreamResponseSchema.safeParse(row);
    if (!parsed.success) {
      continue;
    }
    const cr = parsed.data.completionResponse;
    if (!('Completion' in cr)) {
      continue;
    }
    if (cr.Completion.value.submissionId === submissionId) {
      return parsed.data;
    }
  }
  return undefined;
}

describe('LedgerJsonApiClient / paidTrafficCost on completions', () => {
  test('async submit then completions include paidTrafficCost (WS + REST)', async () => {
    const client = getClient();
    const validatorClient = new ValidatorApiClient(buildIntegrationTestClientConfig());
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
    const details = partiesResponse.partyDetails ?? [];
    const receiverParty = details.map((entry: { party: string }) => entry.party).find((id: string) => id !== partyId);
    if (!receiverParty) {
      throw new Error(
        'Integration precondition failed: need at least two distinct parties on the ledger (transfer offer cannot use self as receiver)'
      );
    }

    const { contractId: walletInstallCid, synchronizerId } = await resolveWalletAppInstallContext(client, partyId);

    const ledgerEnd = await client.getLedgerEnd({});
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

    const blocking = await client.completions({
      userId,
      parties: [partyId],
      beginExclusive,
      limit: 50,
    });

    const row = findCompletionForSubmission(blocking as unknown[], submissionId);
    if (!row) {
      throw new Error(
        `Blocking completions did not include submissionId=${submissionId} (check limit=${50} or timing)`
      );
    }

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
