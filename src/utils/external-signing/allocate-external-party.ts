import { type LedgerJsonApiClient } from '../../clients/ledger-json-api';
import {
  type AllocateExternalPartyParams,
  type AllocateExternalPartyResponse,
} from '../../clients/ledger-json-api/operations/v2/parties/external/allocate-external-party';

export interface AllocateExternalPartyOptions {
  readonly ledgerClient: LedgerJsonApiClient;
  readonly synchronizerId: string;
  readonly identityProviderId: string;
  readonly onboardingTransactions: AllocateExternalPartyParams['onboardingTransactions'];
  readonly multiHashSignatures?: AllocateExternalPartyParams['multiHashSignatures'];
  /**
   * Cancels the HTTP request. Because allocation is a mutation, cancellation after dispatch has an ambiguous outcome
   * and callers must reconcile the exact party ID before deciding whether to retry.
   */
  readonly signal?: AbortSignal;
}

/** Helper that submits the signed external party topology to the ledger. */
export async function allocateExternalParty(
  options: AllocateExternalPartyOptions
): Promise<AllocateExternalPartyResponse> {
  const params: AllocateExternalPartyParams = {
    synchronizer: options.synchronizerId,
    identityProviderId: options.identityProviderId,
    onboardingTransactions: options.onboardingTransactions,
    multiHashSignatures: options.multiHashSignatures,
  };
  return options.signal === undefined
    ? options.ledgerClient.allocateExternalParty(params)
    : options.ledgerClient.allocateExternalParty(params, { signal: options.signal });
}
