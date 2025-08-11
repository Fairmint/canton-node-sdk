import { LedgerJsonApiClient } from '../../clients/ledger-json-api';
import { ValidatorApiClient } from '../../clients/validator-api';
import { NetworkType, ProviderType } from '../../core/types';
import { EnvLoader } from '../../core/config/EnvLoader';
import { preApproveTransfers } from '../amulet/pre-approve-transfers';

export interface CreatePartyOptions {
  /** Network to create the party on */
  network: NetworkType;
  /** Provider to use for the party creation */
  provider: ProviderType;
  /** Party name to use for creation */
  partyName: string;
  /** Amount to fund the party with */
  amount: string;
}

export interface PartyCreationResult {
  /** Party ID from the Validator API */
  partyId: string;
  /** Preapproval contract ID for transfers */
  preapprovalContractId?: string;
}

/**
 * Creates a party on the specified network with optional funding
 * 
 * @param options - Configuration options for party creation
 * @returns Promise resolving to the party creation result
 */
export async function createParty(options: CreatePartyOptions): Promise<PartyCreationResult> {
  // Get configuration for the specified network and provider
  const config = EnvLoader.getConfig('LEDGER_JSON_API', {
    network: options.network,
    provider: options.provider
  });
  
  // Create clients
  const ledgerClient = new LedgerJsonApiClient(config);
  const validatorClient = new ValidatorApiClient(config);
  
  // Get template IDs and contract IDs
  const walletTemplateId = EnvLoader.getInstance().getWalletTemplateId(options.network);
  const walletAppInstallCid = EnvLoader.getInstance().getValidatorWalletAppInstallContractId(options.network);
  
  const amountNum = parseFloat(options.amount);

  console.log(`Creating party ${options.partyName} with ${options.amount} funding on ${options.network}...`);

  // Create user via Validator API
  const userStatus = await validatorClient.createUser({ name: options.partyName });
  const result: PartyCreationResult = { 
    partyId: userStatus.party_id
  };

  // Skip funding if amount is 0
  if (amountNum === 0) {
    console.log('Party created successfully without funding');
    return result;
  }

  // Create and accept transfer offer
  const validatorParty = ledgerClient.getPartyId();
  const trackingId = `welcome-transfer-${Date.now()}`;

  const transferOfferCid = await ledgerClient.submitAndWaitForTransactionTree({
    commands: [{
      ExerciseCommand: {
        templateId: walletTemplateId,
        contractId: walletAppInstallCid,
        choice: 'WalletAppInstall_CreateTransferOffer',
        choiceArgument: {
          receiver: result.partyId,
          amount: { amount: options.amount, unit: 'AmuletUnit' },
          description: `Welcome transfer for ${options.partyName}`,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          trackingId,
        },
      },
    }],
    commandId: `welcome-transfer-${Date.now()}`,
    actAs: [validatorParty],
  });

  const transferOfferEvent = transferOfferCid.transactionTree.eventsById['1'];
  if (!('CreatedTreeEvent' in transferOfferEvent)) {
    throw new Error('Expected CreatedTreeEvent but got different event type');
  }
  const transferOfferContractId = transferOfferEvent.CreatedTreeEvent.value.contractId;

  // Accept transfer offer
  await ledgerClient.submitAndWaitForTransactionTree({
    commands: [{
      ExerciseCommand: {
        templateId: '#splice-wallet:Splice.Wallet.TransferOffer:TransferOffer',
        contractId: transferOfferContractId,
        choice: 'TransferOffer_Accept',
        choiceArgument: {},
      },
    }],
    commandId: `accept-transfer-${Date.now()}`,
    actAs: [result.partyId],
  });

  // Create transfer preapproval
  const preapprovalResult = await preApproveTransfers(ledgerClient, validatorClient, {
    receiverPartyId: result.partyId,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });
  
  result.preapprovalContractId = preapprovalResult.contractId;

  console.log('Party created successfully!');
  return result;
} 