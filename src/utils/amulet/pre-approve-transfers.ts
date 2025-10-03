import { type LedgerJsonApiClient } from '../../clients/ledger-json-api';
import { type DisclosedContract, type ExerciseCommand } from '../../clients/ledger-json-api/schemas/api/commands';
import { type SubmitAndWaitForTransactionTreeParams } from '../../clients/ledger-json-api/operations/v2/commands/submit-and-wait-for-transaction-tree';
import { type ValidatorApiClient } from '../../clients/validator-api';
import { getCurrentMiningRoundContext } from '../mining/mining-rounds';
import { getAmuletsForTransfer } from './get-amulets-for-transfer';

export interface PreApproveTransfersParams {
  /** Party ID to enable pre-approved transfers for (receiver) */
  receiverPartyId: string;
  /** When the pre-approval expires (defaults to 1 day from now) */
  expiresAt?: Date;
  /** Contract details for disclosed contracts (optional - will be fetched if not provided) */
  contractDetails?: {
    amuletRules?: { createdEventBlob: string; synchronizerId: string };
    openMiningRound?: { createdEventBlob: string; synchronizerId: string };
    issuingMiningRounds?: Array<{ createdEventBlob: string; synchronizerId: string }>;
    featuredAppRight?: { createdEventBlob: string; synchronizerId: string };
  };
}

export interface PreApproveTransfersResult {
  /** Contract ID of the created TransferPreapproval contract */
  contractId: string;
  /** Domain ID where the contract was created */
  domainId: string;
  /** Amount of amulet paid for the pre-approval */
  amuletPaid: string;
}

/**
 * Creates a TransferPreapproval contract to enable pre-approved transfers for a party
 *
 * @param ledgerClient - Ledger JSON API client for submitting commands
 * @param validatorClient - Validator API client for getting network information
 * @param params - Parameters for creating the pre-approval
 * @returns Promise resolving to the pre-approval result
 */
export async function preApproveTransfers(
  ledgerClient: LedgerJsonApiClient,
  validatorClient: ValidatorApiClient,
  params: PreApproveTransfersParams
): Promise<PreApproveTransfersResult> {
  // Set default expiration to 1 day from now if not provided
  const expiresAt = params.expiresAt ?? new Date(Date.now() + 24 * 60 * 60 * 1000);

  

  // Get network information
  const [amuletRules, dsoPartyId, miningRoundContext, featuredAppRight] = await Promise.all([
    validatorClient.getAmuletRules(),
    validatorClient.getDsoPartyId(),
    getCurrentMiningRoundContext(validatorClient),
    validatorClient.lookupFeaturedAppRight({ partyId: params.receiverPartyId }),
  ]);

  
  
  
  
  
  

  // Derive current mining round context (handles opensAt logic)
  const { openMiningRound: openMiningRoundContractId, openMiningRoundContract } = miningRoundContext;

  

  // Build disclosed contracts array directly
  const disclosedContracts: DisclosedContract[] = [
    // AmuletRules contract (required)
    {
      contractId: amuletRules.amulet_rules.contract.contract_id,
      templateId: amuletRules.amulet_rules.contract.template_id,
      createdEventBlob: amuletRules.amulet_rules.contract.created_event_blob,
      synchronizerId: amuletRules.amulet_rules.domain_id ?? '',
    },
    // Open mining round contract
    {
      contractId: openMiningRoundContract.contractId,
      templateId: openMiningRoundContract.templateId,
      createdEventBlob: openMiningRoundContract.createdEventBlob,
      synchronizerId: openMiningRoundContract.synchronizerId,
    },
  ];

  // Add featured app right contract if found
  if (featuredAppRight.featured_app_right) {
    disclosedContracts.push({
      contractId: featuredAppRight.featured_app_right.contract_id,
      templateId: featuredAppRight.featured_app_right.template_id,
      createdEventBlob: featuredAppRight.featured_app_right.created_event_blob,
      synchronizerId: amuletRules.amulet_rules.domain_id ?? '',
    });
  }

  

  // Get amulet inputs for the receiver party
  
  const amulets = await getAmuletsForTransfer({
    jsonApiClient: ledgerClient,
    readAs: [params.receiverPartyId],
  });

  if (amulets.length === 0) {
    throw new Error(`No unlocked amulets found for provider party ${params.receiverPartyId}`);
  }

  // Convert amulets to input format
  const inputs = amulets.map((amulet) => ({
    tag: 'InputAmulet' as const,
    value: amulet.contractId,
  }));

  

  // Create the TransferPreapproval contract using AmuletRules_CreateTransferPreapproval
  const createCommand: ExerciseCommand = {
    ExerciseCommand: {
      templateId: amuletRules.amulet_rules.contract.template_id,
      contractId: amuletRules.amulet_rules.contract.contract_id,
      choice: 'AmuletRules_CreateTransferPreapproval',
      choiceArgument: {
        context: {
          amuletRules: amuletRules.amulet_rules.contract.contract_id,
          context: {
            openMiningRound: openMiningRoundContractId,
            issuingMiningRounds: [],
            validatorRights: [],
            featuredAppRight: featuredAppRight.featured_app_right?.contract_id || null,
          },
        },
        inputs,
        receiver: params.receiverPartyId,
        provider: params.receiverPartyId,
        expiresAt: expiresAt.toISOString(),
        expectedDso: dsoPartyId.dso_party_id,
      },
    },
  };

  

  // Submit the command
  const submitParams: SubmitAndWaitForTransactionTreeParams = {
    commands: [createCommand],
    commandId: `create-preapproval-${Date.now()}`,
    actAs: [params.receiverPartyId],
    disclosedContracts,
  };

  
  const result = await ledgerClient.submitAndWaitForTransactionTree(submitParams);

  // Extract the created TransferPreapproval contract ID from the result
  const events = result.transactionTree.eventsById;
  let contractId: string | undefined;

  for (const eventKey in events) {
    const event = events[eventKey];
    if (
      event &&
      'CreatedTreeEvent' in event &&
      event.CreatedTreeEvent?.value?.templateId?.includes('TransferPreapproval')
    ) {
      contractId = event.CreatedTreeEvent.value.contractId;
      break;
    }
  }

  if (!contractId) {
    throw new Error('Failed to create TransferPreapproval contract');
  }

  return {
    contractId,
    domainId: amuletRules.amulet_rules.domain_id ?? '',
    amuletPaid: '0', // This would be extracted from the transfer result
  };
}
