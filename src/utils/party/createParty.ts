import { type LedgerJsonApiClient } from '../../clients/ledger-json-api';
import { type ValidatorApiClient } from '../../clients/validator-api';
import { acceptTransferOffer, createTransferOffer } from '../amulet/offers';
import { preApproveTransfers } from '../amulet/pre-approve-transfers';

export interface CreatePartyOptions {
  /** Ledger JSON API client instance */
  ledgerClient: LedgerJsonApiClient;
  /** Validator API client instance */
  validatorClient: ValidatorApiClient;
  /** Party name to use for creation. This becomes the prefix on the party ID. */
  partyName: string;
  /** Amount to fund the party with. Must be > 0 in order to create a preapproval contract. */
  amount: string;
}

export interface PartyCreationResult {
  /** Party ID from the Validator API */
  partyId: string;
  /** Preapproval contract ID for transfers */
  preapprovalContractId?: string;
}

/**
 * Creates a party, optionally funds the wallet and if funded it then creates a preapproval contract for the party.
 *
 * @param options - Configuration options for party creation
 * @returns Promise resolving to the party creation result
 */
export async function createParty(options: CreatePartyOptions): Promise<PartyCreationResult> {
  // Use provided clients directly
  const { ledgerClient, validatorClient } = options;

  const amountNum = parseFloat(options.amount);
  if (isNaN(amountNum) || amountNum < 0) {
    throw new Error(`Invalid amount: "${options.amount}". Amount must be a valid non-negative number.`);
  }

  // Create user via Validator API
  const userStatus = await validatorClient.createUser({ name: options.partyName });
  const result: PartyCreationResult = {
    partyId: userStatus.party_id,
  };

  // Skip funding if amount is 0
  if (amountNum === 0) {
    return result;
  }

  // Create and accept transfer offer
  const transferOfferContractId = await createTransferOffer({
    ledgerClient,
    receiverPartyId: result.partyId,
    amount: options.amount,
    description: `Welcome transfer for ${options.partyName}`,
  });

  // Accept transfer offer
  await acceptTransferOffer({
    ledgerClient,
    transferOfferContractId,
    acceptingPartyId: result.partyId,
  });

  // Wait 30 seconds for transfer to settle
  await new Promise((resolve) => setTimeout(resolve, 30000));

  // Create transfer preapproval
  const preapprovalResult = await preApproveTransfers(ledgerClient, validatorClient, {
    receiverPartyId: result.partyId,
  });

  result.preapprovalContractId = preapprovalResult.contractId;

  return result;
}
