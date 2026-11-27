/**
 * External-party Canton Coin send through the token standard (`TransferFactory_Transfer` via Ledger interactive
 * submission), end to end through the external-party wallet bridge.
 *
 * Splice 0.8.0 removed the validator's TransferCommand endpoints (`prepare-send` / `submit-send`) the bridge used to
 * call. LocalNet runs the pinned Splice, so this proves the replacement path works; it cannot reproduce the 404.
 */

import { fingerprintEd25519PublicKey } from '@fairmint/canton-protocol/party';
import { generateKeyPairSync, randomUUID, sign, type KeyObject } from 'node:crypto';

import {
  createExternalPartyWalletBridge,
  listTokenStandardV1Holdings,
  ValidationError,
  type ExternalPartyWalletBridge,
  type LedgerJsonApiClient,
  type TokenStandardV1InstrumentId,
} from '../../../../src';
import { retry } from '@fairmint/canton-dev-tools/testing';
import {
  ensureValidatorUserOnboarded,
  getClient as getValidatorClient,
  VALIDATOR_ONBOARDING_HOOK_TIMEOUT_MS,
} from '../validator-api/setup';
import { getClient } from './setup';

const TEST_TIMEOUT_MS = 600_000;

interface ExternalWallet {
  readonly partyId: string;
  readonly publicKeyBase64: string;
  readonly signHex: (hex: string) => string;
}

function generateWalletKey(): { readonly publicKeyBase64: string; readonly privateKey: KeyObject } {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const publicKeyBase64 = Buffer.from(publicKey.export({ format: 'der', type: 'spki' }))
    .subarray(-32)
    .toString('base64');
  return { publicKeyBase64, privateKey };
}

async function resolveLedgerUserId(client: LedgerJsonApiClient, fallback: string): Promise<string> {
  const configured = client.getUserId();
  if (configured) return configured;
  try {
    return (await client.getAuthenticatedUser({})).user.id;
  } catch {
    return fallback;
  }
}

async function onboardExternalWallet(
  bridge: ExternalPartyWalletBridge,
  ledgerClient: LedgerJsonApiClient,
  userId: string,
  label: string
): Promise<ExternalWallet> {
  const { publicKeyBase64, privateKey } = generateWalletKey();
  const signHex = (hex: string): string => sign(null, Buffer.from(hex, 'hex'), privateKey).toString('base64');
  const prepared = await bridge.prepareExternalParty({
    partyName: `cc-ts-${label}-${randomUUID().slice(0, 8)}`,
    publicKeyBase64,
  });
  const submitted = await bridge.submitExternalPartySignature({
    partyId: prepared.partyId,
    publicKeyBase64,
    publicKeyFingerprint: fingerprintEd25519PublicKey(publicKeyBase64),
    multiHashHex: prepared.multiHashHex,
    synchronizerId: prepared.synchronizerId,
    topologyTransactions: prepared.topologyTransactions,
    multiHashSignatureBase64: signHex(prepared.multiHashHex),
  });
  await retry(
    async () => {
      const details = await ledgerClient.getPartyDetails({ party: submitted.partyId, identityProviderId: '' });
      if (!details.partyDetails.some((party) => party.party === submitted.partyId)) {
        throw new Error(`Party details did not include ${submitted.partyId}`);
      }
    },
    { timeoutMs: 120_000, description: `external party ${label} visibility` }
  );
  // No manual grant: the bridge allocated the party with CanActAs for its provider user, which the CC transfer needs.
  const { rights } = await ledgerClient.listUserRights({ userId });
  const actAsParties = (rights ?? []).map((right) => {
    const canActAs: unknown = (right.kind as Record<string, unknown>)['CanActAs'];
    const inner = (canActAs as { value?: { party?: unknown }; party?: unknown } | undefined) ?? {};
    return inner.value?.party ?? inner.party;
  });
  expect(actAsParties).toContain(submitted.partyId);
  return { partyId: submitted.partyId, publicKeyBase64, signHex };
}

async function createTransferPreapproval(bridge: ExternalPartyWalletBridge, wallet: ExternalWallet): Promise<void> {
  const prepared = await bridge.prepareTransferPreapprovalSetup({
    partyId: wallet.partyId,
    publicKeyBase64: wallet.publicKeyBase64,
  });
  if (!prepared.preparedTransaction || !prepared.preparedTransactionHashHex) {
    // Already set up (nothing to sign).
    return;
  }
  await bridge.submitTransferPreapprovalSetup({
    partyId: wallet.partyId,
    publicKeyBase64: wallet.publicKeyBase64,
    preparedTransaction: prepared.preparedTransaction,
    preparedTransactionHashHex: prepared.preparedTransactionHashHex,
    signatureBase64: wallet.signHex(prepared.preparedTransactionHashHex),
  });
}

describe('External-party CC send through the token standard', () => {
  beforeAll(async () => {
    await ensureValidatorUserOnboarded();
  }, VALIDATOR_ONBOARDING_HOOK_TIMEOUT_MS);

  test(
    'sends CC to a preapproved receiver and refuses a receiver without a preapproval',
    async () => {
      const ledgerClient = getClient();
      const validatorClient = getValidatorClient();
      const { party_id: walletParty } = await validatorClient.getUserStatus();
      ledgerClient.setPartyId(walletParty);
      const userId = await resolveLedgerUserId(ledgerClient, 'app-provider-validator');
      const { dso_party_id: dsoPartyId } = await validatorClient.getDsoPartyId();
      const instrumentId: TokenStandardV1InstrumentId = { admin: dsoPartyId, id: 'Amulet' };

      const bridge = createExternalPartyWalletBridge({
        ledgerClient,
        validatorClient,
        providerPartyId: walletParty,
        providerUserId: userId,
        grantProviderUserActAs: true,
        prepareTokenSecret: `localnet-${randomUUID()}`,
        provider: 'localnet',
        network: 'localnet',
      });

      const sender = await onboardExternalWallet(bridge, ledgerClient, userId, 'sender');
      const receiver = await onboardExternalWallet(bridge, ledgerClient, userId, 'receiver');
      const unapproved = await onboardExternalWallet(bridge, ledgerClient, userId, 'unapproved');
      // Each preapproval purchase and the sender's funding are paid from the validator wallet.
      await validatorClient.tap({ amount: '1000', command_id: `cc-ts-fund-${randomUUID()}` });
      await createTransferPreapproval(bridge, sender);
      await createTransferPreapproval(bridge, receiver);

      const unlockedHoldings = async (party: string): Promise<ReadonlyArray<{ contractId: string; amount: string }>> =>
        (
          await listTokenStandardV1Holdings({
            ledger: ledgerClient,
            parties: [party],
            owner: party,
            instrumentId,
            instrumentDecimals: 10,
          })
        )
          .filter((holding) => holding.lock === null)
          .map(({ contractId, amount }) => ({ contractId, amount }));
      const total = (holdings: ReadonlyArray<{ amount: string }>): number =>
        holdings.reduce((sum, holding) => sum + Number(holding.amount), 0);

      // Fund the sender through its preapproval.
      await retry(
        async () =>
          bridge.sendProviderTransferToPreapprovedParty({
            receiverPartyId: sender.partyId,
            amount: '50',
            idempotencyKey: `cc-ts-fund-sender-${sender.partyId}`,
          }),
        { timeoutMs: 120_000, pollIntervalMs: 5_000, description: 'funding the sender' }
      );
      await retry(
        async () => {
          if (total(await unlockedHoldings(sender.partyId)) < 40) throw new Error('sender not funded yet');
        },
        { timeoutMs: 120_000, description: 'sender funding' }
      );
      const receiverBefore = total(await unlockedHoldings(receiver.partyId));

      // The registry sees the receiver's preapproval once scan has ingested it, so retry until it chooses `direct`.
      const prepared = await retry(
        async () =>
          bridge.prepareCcTransfer({
            senderPartyId: sender.partyId,
            receiverPartyId: receiver.partyId,
            amount: '5',
            description: 'token-standard CC send',
            publicKeyBase64: sender.publicKeyBase64,
          }),
        { timeoutMs: 180_000, pollIntervalMs: 5_000, description: 'a direct CC transfer to the receiver' }
      );
      expect(prepared.transferKind).toBe('direct');
      expect(prepared.nonce).toBe(0);
      expect(prepared.transferCommandContractIdPrefix).toBe(prepared.commandId);

      const submitted = await bridge.submitCcTransfer({
        ...prepared,
        publicKeyBase64: sender.publicKeyBase64,
        signatureBase64: sender.signHex(prepared.preparedTransactionHashHex),
      });
      expect(submitted.updateId).toMatch(/\S+/);
      await retry(
        async () => {
          const after = total(await unlockedHoldings(receiver.partyId));
          if (after < receiverBefore + 5 - 1e-9) throw new Error(`receiver balance ${after} not increased yet`);
        },
        { timeoutMs: 60_000, description: 'receiver balance increase' }
      );

      // A receiver without a preapproval is refused before anything is prepared, and nothing is locked.
      const senderBefore = await unlockedHoldings(sender.partyId);
      const refused = bridge.prepareCcTransfer({
        senderPartyId: sender.partyId,
        receiverPartyId: unapproved.partyId,
        amount: '1',
        publicKeyBase64: sender.publicKeyBase64,
      });
      await expect(refused).rejects.toBeInstanceOf(ValidationError);
      await expect(refused).rejects.toMatchObject({
        context: expect.objectContaining({ reason: 'receiver_has_no_transfer_preapproval' }) as object,
      });
      const senderAfter = await unlockedHoldings(sender.partyId);
      expect(senderAfter.map((holding) => holding.contractId).sort()).toEqual(
        senderBefore.map((holding) => holding.contractId).sort()
      );
    },
    TEST_TIMEOUT_MS
  );
});
