import { type LedgerJsonApiClient } from '../../clients/ledger-json-api';
import { type ValidatorApiClient } from '../../clients/validator-api';
import { type ContractId, type PartyId } from '../../core/branded-types';
import { ValidationError } from '../../core/errors';
import { waitForCondition } from '../../core/utils/polling';
import { getAmuletsForTransfer } from '../amulet/get-amulets-for-transfer';
import { acceptTransferOffer, createTransferOffer } from '../amulet/offers';
import { preApproveTransfers } from '../amulet/pre-approve-transfers';

export interface CreatePartyOptions {
  /** Ledger JSON API client instance. */
  readonly ledgerClient: LedgerJsonApiClient;
  /** Validator API client instance. */
  readonly validatorClient: ValidatorApiClient;
  /** Party name to use for creation. This becomes the prefix on the party ID. */
  readonly partyName: string;
  /** Amount to fund the party with. Must be > 0 in order to create a preapproval contract. */
  readonly amount: string;
}

export interface PartyCreationResult {
  /** Party ID from the Validator API. */
  readonly partyId: PartyId;
  /** Preapproval contract ID for transfers. */
  readonly preapprovalContractId?: ContractId;
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
    throw new ValidationError(`Invalid amount: "${options.amount}". Amount must be a valid non-negative number.`, {
      amount: options.amount,
      partyName: options.partyName,
    });
  }

  // Create user via Validator API
  const userStatus = await validatorClient.createUser({ name: options.partyName });
  const partyId = userStatus.party_id as PartyId;

  // Skip funding if amount is 0
  if (amountNum === 0) {
    return { partyId };
  }

  // Create and accept transfer offer
  const transferOfferContractId = await createTransferOffer({
    ledgerClient,
    receiverPartyId: partyId,
    amount: options.amount,
    description: `Welcome transfer for ${options.partyName}`,
  });

  // Accept transfer offer
  await acceptTransferOffer({
    ledgerClient,
    transferOfferContractId,
    acceptingPartyId: partyId,
  });

  // Poll until amulets are available (transfer has settled)
  await waitForCondition(
    async () => {
      const amulets = await getAmuletsForTransfer({
        jsonApiClient: ledgerClient,
        readAs: [partyId],
      });
      return amulets.length > 0 ? amulets : null;
    },
    {
      timeout: 60000,
      interval: 2000,
      timeoutMessage: `Timeout waiting for transfer to settle for party ${partyId}`,
    }
  );

  // Create transfer preapproval
  const preapprovalResult = await preApproveTransfers(ledgerClient, validatorClient, {
    receiverPartyId: partyId,
  });

  return {
    partyId,
    preapprovalContractId: preapprovalResult.contractId as ContractId,
  };
}
