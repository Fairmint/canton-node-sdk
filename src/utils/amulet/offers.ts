import { type LedgerJsonApiClient } from '../../clients/ledger-json-api';
import { type SubmitAndWaitForTransactionTreeResponse } from '../../clients/ledger-json-api/operations';
import { EnvLoader } from '../../core/config/EnvLoader';
import { OperationError, OperationErrorCode } from '../../core/errors';

export interface CreateTransferOfferParams {
  /** Ledger client for submitting commands */
  ledgerClient: LedgerJsonApiClient;
  /** Receiver party ID */
  receiverPartyId: string;
  /** Amount to transfer */
  amount: string;
  /** Description for the transfer */
  description: string;
  /** When the offer expires (optional, defaults to 24 hours from now) */
  expiresAt?: Date;
}

export interface AcceptTransferOfferParams {
  /** Ledger client for submitting commands */
  ledgerClient: LedgerJsonApiClient;
  /** Transfer offer contract ID to accept */
  transferOfferContractId: string;
  /** Party ID accepting the offer */
  acceptingPartyId: string;
}

/**
 * Creates a transfer offer using WalletAppInstall_CreateTransferOffer
 *
 * @param params - Parameters for creating the transfer offer
 * @returns Promise resolving to the transfer offer contract ID
 */
export async function createTransferOffer(params: CreateTransferOfferParams): Promise<string> {
  const { ledgerClient, receiverPartyId, amount, description, expiresAt } = params;

  // Get template IDs and contract IDs from the client's network
  const network = ledgerClient.getNetwork();
  const walletAppInstallCid = EnvLoader.getInstance().getValidatorWalletAppInstallContractId(network);

  const validatorParty = ledgerClient.getPartyId();
  const trackingId = `transfer-offer-${Date.now()}`;
  const defaultExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const transferOfferCid = await ledgerClient.submitAndWaitForTransactionTree({
    commands: [
      {
        ExerciseCommand: {
          templateId: '#splice-wallet:Splice.Wallet.Install:WalletAppInstall',
          contractId: walletAppInstallCid,
          choice: 'WalletAppInstall_CreateTransferOffer',
          choiceArgument: {
            receiver: receiverPartyId,
            amount: { amount, unit: 'AmuletUnit' },
            description,
            expiresAt: (expiresAt ?? defaultExpiresAt).toISOString(),
            trackingId,
          },
        },
      },
    ],
    commandId: `transfer-offer-${Date.now()}`,
    actAs: [validatorParty],
  });

  const transferOfferEvent = transferOfferCid.transactionTree.eventsById['1'];
  if (!transferOfferEvent || !('CreatedTreeEvent' in transferOfferEvent)) {
    const firstKey = transferOfferEvent ? Object.keys(transferOfferEvent)[0] : 'undefined';
    throw new OperationError(`Expected CreatedTreeEvent but got ${firstKey}`, OperationErrorCode.TRANSACTION_FAILED, {
      eventType: firstKey,
      receiverPartyId,
      amount,
    });
  }

  return transferOfferEvent.CreatedTreeEvent.value.contractId;
}

/**
 * Accepts a transfer offer using TransferOffer_Accept
 *
 * @param params - Parameters for accepting the transfer offer
 * @returns Promise resolving when the offer is accepted
 */
export async function acceptTransferOffer(
  params: AcceptTransferOfferParams
): Promise<SubmitAndWaitForTransactionTreeResponse> {
  const { ledgerClient, transferOfferContractId, acceptingPartyId } = params;

  return ledgerClient.submitAndWaitForTransactionTree({
    commands: [
      {
        ExerciseCommand: {
          templateId: '#splice-wallet:Splice.Wallet.TransferOffer:TransferOffer',
          contractId: transferOfferContractId,
          choice: 'TransferOffer_Accept',
          choiceArgument: {},
        },
      },
    ],
    commandId: `accept-transfer-${Date.now()}`,
    actAs: [acceptingPartyId],
  });
}
