/** Canton response helper integration tests against cn-quickstart LocalNet. */

import {
  findCantonCoinBalance,
  normalizeCantonContractItem,
  type CantonWalletBalances,
} from '../../../src/utils/canton-response-utils';
import { getClient as getLedgerClient } from './ledger-api/setup';
import {
  ensureValidatorUserOnboarded,
  getClient as getValidatorClient,
  VALIDATOR_ONBOARDING_HOOK_TIMEOUT_MS,
} from './validator-api/setup';

const WALLET_APP_INSTALL_TEMPLATE_SUFFIX = 'Splice.Wallet.Install:WalletAppInstall';

interface LiveWalletAmulet {
  readonly contract: {
    readonly contract: {
      readonly contract_id: string;
    };
  };
  readonly effective_amount: string | number;
}

describe('Canton response helpers / LocalNet', (): void => {
  beforeAll(ensureValidatorUserOnboarded, VALIDATOR_ONBOARDING_HOOK_TIMEOUT_MS);

  test('normalizes a live active-contract item from the ledger API', async (): Promise<void> => {
    const ledgerClient = getLedgerClient();
    const validatorClient = getValidatorClient();
    const userStatus = await validatorClient.getUserStatus();
    const partyId = userStatus.party_id;
    if (!partyId) {
      throw new Error('getUserStatus returned empty party_id');
    }

    const activeContracts = await ledgerClient.getActiveContracts({
      parties: [partyId],
      templateIds: [`#splice-wallet:${WALLET_APP_INSTALL_TEMPLATE_SUFFIX}`],
      includeCreatedEventBlob: true,
    });
    const activeContract = activeContracts[0];
    if (!activeContract) {
      throw new Error(`Could not find ${WALLET_APP_INSTALL_TEMPLATE_SUFFIX} for ${partyId}`);
    }

    const normalized = normalizeCantonContractItem(activeContract);

    expect(normalized.contractId).toMatch(/\S/);
    expect(normalized.templateId).toContain(WALLET_APP_INSTALL_TEMPLATE_SUFFIX);
    expect(normalized.createArgument).toEqual(expect.any(Object));
    expect(normalized.createdEventBlob).toMatch(/\S/);
  });

  test('finds a Canton Coin balance built from live validator wallet data', async (): Promise<void> => {
    const validatorClient = getValidatorClient();
    const [{ dso_party_id: dsoPartyId }, userStatus, walletBalance, amulets] = await Promise.all([
      validatorClient.getDsoPartyId(),
      validatorClient.getUserStatus(),
      validatorClient.getWalletBalance(),
      validatorClient.getAmulets(),
    ]);
    const partyId = userStatus.party_id;
    if (!partyId) {
      throw new Error('getUserStatus returned empty party_id');
    }
    const toUtxo = (amulet: LiveWalletAmulet): { readonly contractId: string; readonly amount: string } => ({
      contractId: amulet.contract.contract.contract_id,
      amount: String(amulet.effective_amount),
    });
    const unlockedAmulets = amulets.amulets as readonly LiveWalletAmulet[];
    const lockedAmulets = amulets.locked_amulets as readonly LiveWalletAmulet[];

    const balances: CantonWalletBalances = {
      partyId,
      fetchedAt: new Date().toISOString(),
      tokens: [
        {
          instrumentId: { admin: dsoPartyId, id: 'Amulet' },
          totalUnlockedBalance: String(walletBalance.effective_unlocked_qty ?? '0'),
          totalLockedBalance: '0',
          totalBalance: String(walletBalance.effective_unlocked_qty ?? '0'),
          unlockedUtxos: unlockedAmulets.map(toUtxo),
          lockedUtxos: lockedAmulets.map(toUtxo),
        },
      ],
    };
    const [expectedToken] = balances.tokens;
    if (!expectedToken) {
      throw new Error('Integration test constructed no Canton Coin token balance');
    }

    const balance = findCantonCoinBalance(balances, { expectedAdmin: dsoPartyId });

    expect(balance).toBe(expectedToken);
    expect(balance?.instrumentId.id).toBe('Amulet');
    expect(balance?.unlockedUtxos).toHaveLength(unlockedAmulets.length);
    expect(balance?.lockedUtxos).toHaveLength(lockedAmulets.length);
  });
});
