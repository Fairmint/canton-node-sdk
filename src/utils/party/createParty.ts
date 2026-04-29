import { type LedgerJsonApiClient } from '../../clients/ledger-json-api';
import { type ValidatorApiClient } from '../../clients/validator-api';
import { ContractId, PartyId } from '../../core/branded-types';
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
 * @param options - Ledger + validator clients, human-readable party prefix, optional funded wallet (`amount` > 0)
 * @returns `partyId` plus optional `preapprovalContractId` when transfers succeed past onboarding funding.
 * @throws ValidationError when `amount` is not a valid non-negative number string.
 *
 * @example Fund onboarding wallet + pre-approve transfers for downstream transfers:
 * ```ts
 * const { partyId, preapprovalContractId } = await createParty({
 *   ledgerClient: canton.ledger,
 *   validatorClient: canton.validator,
 *   partyName: 'alice',
 *   amount: '100',
 * });
 * ```
 *
 * @example Bare identity without sponsoring transfers (`amount` `'0'`):
 * ```ts
 * await createParty({ ledgerClient, validatorClient, partyName: 'bob', amount: '0' });
 * ```
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
  const partyId = PartyId(userStatus.party_id);

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
    preapprovalContractId: ContractId(preapprovalResult.contractId),
  };
}
