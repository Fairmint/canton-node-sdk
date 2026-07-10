/** Shared setup for LedgerJsonApiClient integration tests. */

import { CantonRuntime, LedgerJsonApiClient } from '../../../../src';
import { EnvLoader } from '../../../../src/core/config/EnvLoader';
import { ConfigurationError } from '../../../../src/core/errors';
import { buildIntegrationTestClientConfig } from '../../../utils/testConfig';

let client: LedgerJsonApiClient | null = null;
const WALLET_APP_INSTALL_TEMPLATE_SUFFIX = 'Splice.Wallet.Install:WalletAppInstall';

/**
 * Get the shared LedgerJsonApiClient instance for tests. Creates the client on first call, reuses it for subsequent
 * calls.
 */
export function getClient(): LedgerJsonApiClient {
  if (!client) {
    const config = buildIntegrationTestClientConfig();
    client = new LedgerJsonApiClient(new CantonRuntime(config));
  }
  return client;
}

/** Resolve the validator wallet-install contract from local configuration or the live active-contract snapshot. */
export async function resolveWalletAppInstallContext(
  ledgerClient: LedgerJsonApiClient,
  partyId: string
): Promise<{ contractId: string; synchronizerId: string | undefined }> {
  try {
    const contractId = EnvLoader.getInstance().getValidatorWalletAppInstallContractId('localnet');
    return { contractId, synchronizerId: undefined };
  } catch (error) {
    if (!(error instanceof ConfigurationError)) {
      throw error;
    }
    const snapshot = await ledgerClient.getActiveContracts({
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
