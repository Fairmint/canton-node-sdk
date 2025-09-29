import { LedgerJsonApiClient } from '../../clients/ledger-json-api';
import { ValidatorApiClient } from '../../clients/validator-api';
import { ExerciseCommand, DisclosedContract } from '../../clients/ledger-json-api/schemas/api/commands';
import { getCurrentMiningRoundContext } from '../mining/mining-rounds';
import { getAmuletsForTransfer } from './get-amulets-for-transfer';

export interface TransferRequest {
  /** Recipient party ID */
  recipientPartyId: string;
  /** Amount to transfer */
  amount: string;
  /** Optional description for the transfer */
  description?: string;
}

export interface TransferToPreapprovedParams {
  /** Party ID sending the transfer */
  senderPartyId: string;
  /** Array of transfer requests */
  transfers: TransferRequest[];
}

export interface TransferToPreapprovedResult {
  /** Array of transfer results */
  transferResults: Array<{
    /** Recipient party ID */
    recipientPartyId: string;
    /** Contract ID of the TransferPreapproval contract used */
    contractId: string;
    /** Domain ID where the transfer occurred */
    domainId: string;
    /** Transfer result summary */
    transferResult: any;
  }>;
}

/**
 * Transfers coins to multiple parties that have pre-approved transfers enabled
 * 
 * @example
 * ```typescript
 * const result = await transferToPreapproved(ledgerClient, validatorClient, {
 *   senderPartyId: 'sender-party-id',
 *   transfers: [
 *     {
 *       recipientPartyId: 'recipient-1',
 *       amount: '100',
 *       description: 'Payment for services'
 *     },
 *     {
 *       recipientPartyId: 'recipient-2', 
 *       amount: '50',
 *       description: 'Bonus payment'
 *     }
 *   ]
 * });
 * 
 * console.log(`Completed ${result.transferResults.length} transfers`);
 * ```
 * 
 * @param ledgerClient - Ledger JSON API client for submitting commands
 * @param validatorClient - Validator API client for getting network information
 * @param params - Parameters for the transfers
 * @returns Promise resolving to the transfer results
 */
export async function transferToPreapproved(
  ledgerClient: LedgerJsonApiClient,
  validatorClient: ValidatorApiClient,
  params: TransferToPreapprovedParams
): Promise<TransferToPreapprovedResult> {
  if (params.transfers.length === 0) {
    throw new Error('At least one transfer must be provided');
  }

  // Get network information
  const [amuletRules, miningRoundContext] = await Promise.all([
    validatorClient.getAmuletRules(),
    getCurrentMiningRoundContext(validatorClient)
  ]);

  const {
    openMiningRound: openMiningRoundContractId,
  } = miningRoundContext;

  // Get amulet inputs for the sender party
  console.log('🔍 Fetching amulet inputs for sender party...');
  const amulets = await getAmuletsForTransfer({
    jsonApiClient: ledgerClient,
    readAs: [params.senderPartyId]
  });

  if (amulets.length === 0) {
    throw new Error(`No unlocked amulets found for sender party ${params.senderPartyId}`);
  }

  // Convert amulets to input format
  const inputs = amulets.map(amulet => ({
    tag: 'InputAmulet' as const,
    value: amulet.contractId
  }));

  console.log(`📦 Found ${amulets.length} amulets for transfer`);

  const transferResults: TransferToPreapprovedResult['transferResults'] = [];

  // Build base disclosed contracts (shared across all transfers)
  const disclosedContracts: DisclosedContract[] = [
    // AmuletRules contract (required)
    {
      contractId: amuletRules.amulet_rules.contract.contract_id,
      templateId: amuletRules.amulet_rules.contract.template_id,
      createdEventBlob: amuletRules.amulet_rules.contract.created_event_blob,
      synchronizerId: amuletRules.amulet_rules.domain_id || '',
    },
    // Open mining round contract (shared)
    {
      contractId: miningRoundContext.openMiningRoundContract.contractId,
      templateId: miningRoundContext.openMiningRoundContract.templateId,
      createdEventBlob: miningRoundContext.openMiningRoundContract.createdEventBlob,
      synchronizerId: miningRoundContext.openMiningRoundContract.synchronizerId,
    }
  ];

  // Process each transfer
  for (const transfer of params.transfers) {
    console.log(`🔄 Processing transfer to ${transfer.recipientPartyId}...`);

    // Look up transfer preapproval for the recipient
    const transferPreapprovalResponse = await validatorClient.lookupTransferPreapprovalByParty({
      partyId: transfer.recipientPartyId,
    });

    if (!transferPreapprovalResponse.transfer_preapproval) {
      throw new Error(`No transfer preapproval found for party ${transfer.recipientPartyId}`);
    }

    const transferPreapprovalContract = transferPreapprovalResponse.transfer_preapproval.contract;
    const transferPreapprovalContractId = transferPreapprovalContract.contract_id;

    if (!transferPreapprovalResponse.transfer_preapproval.domain_id) {
      throw new Error(`No domain ID found for transfer preapproval for party ${transfer.recipientPartyId}`);
    }

    // Look up featured app right for the recipient
    const featuredAppRight = await validatorClient.lookupFeaturedAppRight({ 
      partyId: transfer.recipientPartyId 
    });

    if (!featuredAppRight.featured_app_right?.contract_id) {
      throw new Error(`No featured app right found for party ${transfer.recipientPartyId}`);
    }

    const featuredAppRightContractId = featuredAppRight.featured_app_right.contract_id;

    // Build transfer-specific disclosed contracts
    const transferDisclosedContracts: DisclosedContract[] = [
      ...disclosedContracts, // Include base contracts
      // Featured app right contract for this recipient
      {
        contractId: featuredAppRight.featured_app_right.contract_id,
        templateId: featuredAppRight.featured_app_right.template_id,
        createdEventBlob: featuredAppRight.featured_app_right.created_event_blob,
        synchronizerId: amuletRules.amulet_rules.domain_id || '',
      },
      // Transfer preapproval contract for this recipient
      {
        contractId: transferPreapprovalContractId,
        templateId: transferPreapprovalContract.template_id,
        createdEventBlob: transferPreapprovalContract.created_event_blob,
        synchronizerId: transferPreapprovalResponse.transfer_preapproval.domain_id,
      }
    ];

    // Create the transfer command using TransferPreapproval_Send
    const transferCommand: ExerciseCommand = {
      ExerciseCommand: {
        templateId: '#splice-amulet:Splice.AmuletRules:TransferPreapproval',
        contractId: transferPreapprovalContractId,
        choice: 'TransferPreapproval_Send',
        choiceArgument: {
          context: {
            amuletRules: amuletRules.amulet_rules.contract.contract_id,
            context: {
              openMiningRound: openMiningRoundContractId,
              issuingMiningRounds: [],
              validatorRights: [],
              featuredAppRight: featuredAppRightContractId
            }
          },
          inputs,
          amount: transfer.amount,
          sender: params.senderPartyId,
          description: transfer.description || null
        }
      }
    };

    if (!amuletRules.amulet_rules.domain_id) {
      throw new Error('Amulet rules domain ID is required');
    }

    // Submit the command
    const submitParams: any = {
      commands: [transferCommand],
      commandId: `transfer-preapproved-${transfer.recipientPartyId}-${Date.now()}`,
      actAs: [params.senderPartyId],
      disclosedContracts: transferDisclosedContracts,
    };

    const result = await ledgerClient.submitAndWaitForTransactionTree(submitParams);

    transferResults.push({
      recipientPartyId: transfer.recipientPartyId,
      contractId: transferPreapprovalContractId,
      domainId: amuletRules.amulet_rules.domain_id,
      transferResult: result,
    });

    console.log(`✅ Transfer to ${transfer.recipientPartyId} completed successfully`);
  }

  return { transferResults };
}