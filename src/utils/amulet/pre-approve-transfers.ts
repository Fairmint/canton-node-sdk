import { LedgerJsonApiClient } from '../../clients/ledger-json-api';
import { ValidatorApiClient } from '../../clients/validator-api';
import { ExerciseCommand } from '../../clients/ledger-json-api/schemas/api/commands';
import { buildAmuletDisclosedContracts, createContractInfo } from './disclosed-contracts';

export interface PreApproveTransfersParams {
  /** Party ID to enable pre-approved transfers for (receiver) */
  receiverPartyId: string;
  /** Party ID that will manage the pre-approval (provider) */
  providerPartyId: string;
  /** When the pre-approval expires */
  expiresAt: Date;
  /** Amulet inputs to pay for the pre-approval fee */
  inputs: Array<{ tag: 'InputAmulet'; value: string }>;
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
  console.log('🔍 Fetching network information...');
  
  // Get network information
  const [amuletRules, dsoPartyId, miningRounds, featuredAppRight] = await Promise.all([
    validatorClient.getAmuletRules(),
    validatorClient.getDsoPartyId(),
    validatorClient.getOpenAndIssuingMiningRounds(),
    validatorClient.lookupFeaturedAppRight({ partyId: params.providerPartyId })
  ]);

  console.log('📊 Network information fetched:');
  console.log(`   Amulet Rules Contract ID: ${amuletRules.amulet_rules.contract.contract_id}`);
  console.log(`   DSO Party ID: ${dsoPartyId.dso_party_id}`);
  console.log(`   Open Mining Rounds: ${miningRounds.open_mining_rounds.length}`);
  console.log(`   Issuing Mining Rounds: ${miningRounds.issuing_mining_rounds.length}`);
  console.log(`   Featured App Right: ${featuredAppRight.featured_app_right ? 'Found' : 'Not found'}`);

  // Get the first open mining round contract ID
  const openMiningRoundContractId = miningRounds.open_mining_rounds[0]?.contract?.contract_id;
  if (!openMiningRoundContractId) {
    console.error('❌ No open mining rounds found. Available rounds:', JSON.stringify(miningRounds, null, 2));
    throw new Error('No open mining rounds available');
  }

  console.log(`✅ Using open mining round: ${openMiningRoundContractId}`);

  // Build disclosed contracts
  const disclosedContractsParams: any = {
    amuletRules: createContractInfo(
      amuletRules.amulet_rules.contract.contract_id,
      amuletRules.amulet_rules.contract.created_event_blob,
      amuletRules.amulet_rules.domain_id,
      amuletRules.amulet_rules.contract.template_id
    ),
    openMiningRound: createContractInfo(
      openMiningRoundContractId,
      miningRounds.open_mining_rounds[0]?.contract?.created_event_blob || '',
      miningRounds.open_mining_rounds[0]?.domain_id || '',
      miningRounds.open_mining_rounds[0]?.contract?.template_id
    ),
  };

  if (featuredAppRight.featured_app_right) {
    disclosedContractsParams.featuredAppRight = createContractInfo(
      featuredAppRight.featured_app_right.contract_id,
      featuredAppRight.featured_app_right.created_event_blob,
      featuredAppRight.featured_app_right.domain_id,
      featuredAppRight.featured_app_right.template_id
    );
  }

  const disclosedContracts = buildAmuletDisclosedContracts(disclosedContractsParams);

  console.log(`📋 Built ${disclosedContracts.length} disclosed contracts`);

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
            featuredAppRight: featuredAppRight.featured_app_right?.contract_id || null
          }
        },
        inputs: params.inputs,
        receiver: params.receiverPartyId,
        provider: params.providerPartyId,
        expiresAt: params.expiresAt.toISOString()
      }
    }
  };

  console.log('📝 Created exercise command for TransferPreapproval');

  // Submit the command
  const submitParams: any = {
    commands: [createCommand],
    commandId: `create-preapproval-${Date.now()}`,
    actAs: [params.providerPartyId, params.receiverPartyId],
    disclosedContracts,
  };
  
  console.log('🚀 Submitting command to ledger...');
  const result = await ledgerClient.submitAndWaitForTransactionTree(submitParams);

  // Extract the created TransferPreapproval contract ID from the result
  const events = result.transactionTree.eventsById;
  let contractId: string | undefined;
  
  for (const eventKey in events) {
    const event = events[eventKey];
    if (event && 'CreatedTreeEvent' in event && event.CreatedTreeEvent?.value?.templateId?.includes('TransferPreapproval')) {
      contractId = event.CreatedTreeEvent.value.contractId;
      break;
    }
  }
  
  if (!contractId) {
    throw new Error('Failed to create TransferPreapproval contract');
  }

  return {
    contractId,
    domainId: amuletRules.amulet_rules.domain_id,
    amuletPaid: '0' // This would be extracted from the transfer result
  };
} 