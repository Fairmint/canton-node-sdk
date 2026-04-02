/**
 * End-to-end check that Canton exposes `paidTrafficCost` on completions (Ledger JSON API).
 *
 * Uses async submit + completions (WebSocket and blocking REST) against cn-quickstart.
 */

import { ValidatorApiClient } from '../../../../src';
import { waitForCompletionWithMetadata } from '../../../../src/clients/ledger-json-api';
import { EnvLoader } from '../../../../src/core/config/EnvLoader';
import { CompletionStreamResponseSchema } from '../../../../src/clients/ledger-json-api/schemas/api/completions';
import { getPaidTrafficCostFromCompletion } from '../../../../src/utils/traffic/paid-traffic-cost';
import { buildIntegrationTestClientConfig } from '../../../utils/testConfig';
import { getClient } from './setup';

/**
 * Ledger userId for completions / async submit. Order matches `scripts/grant-user-rights.ts`: validator `user_name` is
 * the participant user id when OAuth token user is not exposed on the ledger API.
 */
async function resolveLedgerUserId(client: ReturnType<typeof getClient>): Promise<string> {
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
    // CI / cn-quickstart: ledger authenticated-user may be unavailable; validator-user matches grant-user-rights flow.
    const validatorClient = new ValidatorApiClient(buildIntegrationTestClientConfig());
    const info = await validatorClient.getValidatorUserInfo();
    if (!info.user_name) {
      throw new Error('getValidatorUserInfo returned empty user_name');
    }
    return info.user_name;
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
    const userId = await resolveLedgerUserId(client);

    const partiesResponse = await client.listParties({});
    const details = partiesResponse.partyDetails ?? [];
    const partyId = details[0]?.party;
    if (!partyId) {
      throw new Error('Integration precondition failed: listParties returned no parties');
    }
    client.setPartyId(partyId);

    const receiverParty = details.map((entry: { party: string }) => entry.party).find((id: string) => id !== partyId);
    if (!receiverParty) {
      throw new Error(
        'Integration precondition failed: need at least two distinct parties on the ledger (transfer offer cannot use self as receiver)'
      );
    }

    const walletInstallCid = EnvLoader.getInstance().getValidatorWalletAppInstallContractId('localnet');

    const ledgerEnd = await client.getLedgerEnd({});
    const beginExclusive = ledgerEnd.offset;

    const submissionId = `paid-traffic-it-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const commandId = submissionId;
    const trackingId = submissionId;
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await client.asyncSubmit({
      commandId,
      submissionId,
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
    expect(wsResult.paidTrafficCost).toBeDefined();
    expect(wsResult.paidTrafficCost).toBeGreaterThanOrEqual(0n);

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
    expect(paid).toBeDefined();
    expect(paid).toBeGreaterThanOrEqual(0n);
    expect(paid).toEqual(wsResult.paidTrafficCost);
  }, 180_000);
});
