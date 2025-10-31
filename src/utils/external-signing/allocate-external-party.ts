import { type LedgerJsonApiClient } from '../../clients/ledger-json-api';
import {
  type AllocateExternalPartyParams,
  type AllocateExternalPartyResponse,
} from '../../clients/ledger-json-api/operations/v2/parties/external/allocate-external-party';

export interface AllocateExternalPartyOptions {
  ledgerClient: LedgerJsonApiClient;
  synchronizerId: string;
  identityProviderId: string;
  onboardingTransactions?: AllocateExternalPartyParams['onboardingTransactions'];
  multiHashSignatures?: AllocateExternalPartyParams['multiHashSignatures'];
}

/**
 * Helper that submits the signed external party topology to the ledger.
 */
export async function allocateExternalParty(
  options: AllocateExternalPartyOptions
): Promise<AllocateExternalPartyResponse> {
  return options.ledgerClient.allocateExternalParty({
    synchronizer: options.synchronizerId,
    identityProviderId: options.identityProviderId,
    onboardingTransactions: options.onboardingTransactions,
    multiHashSignatures: options.multiHashSignatures,
  });
}
