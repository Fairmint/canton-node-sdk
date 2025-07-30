import { LedgerJsonApiClient } from '../../clients/ledger-json-api';
import { ValidatorApiClient } from '../../clients/validator-api';
import { ExerciseCommand } from '../../clients/ledger-json-api/schemas/api/commands';
import { getCurrentMiningRoundContext } from './mining-rounds';
import { buildAmuletDisclosedContracts, createContractInfo } from './disclosed-contracts';

export interface TransferPreapprovalInfo {
  /** Contract ID of the TransferPreapproval contract */
  contractId: string;
  /** Template ID of the TransferPreapproval contract */
  templateId: string;
  /** Created event blob of the TransferPreapproval contract */
  createdEventBlob: string;
  /** Synchronizer ID where the TransferPreapproval contract resides */
  synchronizerId: string;
}

export interface TransferToPreapprovedParams {
  /** Party ID sending the transfer */
  senderPartyId: string;
  /** Recipient party ID */
  recipientPartyId: string;
  /** TransferPreapproval contract information (required for disclosure) */
  transferPreapproval: TransferPreapprovalInfo;
  /** Amount to transfer */
  amount: string;
  /** Optional description for the transfer */
  description?: string;
  /** Amulet inputs to transfer */
  inputs: Array<{ tag: 'InputAmulet'; value: string }>;
}

export interface TransferToPreapprovedResult {
  /** Contract ID of the TransferPreapproval contract used */
  contractId: string;
  /** Domain ID where the transfer occurred */
  domainId: string;
  /** Transfer result summary */
  transferResult: any;
}

/**
 * Transfers coins to a party that has pre-approved transfers enabled
 * 
 * @param ledgerClient - Ledger JSON API client for submitting commands
 * @param validatorClient - Validator API client for getting network information
 * @param params - Parameters for the transfer
 * @returns Promise resolving to the transfer result
 */
export async function transferToPreapproved(
  ledgerClient: LedgerJsonApiClient,
  validatorClient: ValidatorApiClient,
  params: TransferToPreapprovedParams
): Promise<TransferToPreapprovedResult> {
  console.log('=== TRANSFER TO PREAPPROVED DEBUG START ===');
  console.log('Input params:', JSON.stringify(params, null, 2));
  
  // Get network information
  console.log('Fetching network information...');
  const [amuletRules, miningRoundContext, featuredAppRight] = await Promise.all([
    validatorClient.getAmuletRules(),
    getCurrentMiningRoundContext(validatorClient),
    validatorClient.lookupFeaturedAppRight({ partyId: params.recipientPartyId })
  ]);

  console.log('=== FEATURED APP RIGHT DEBUG ===');
  console.log('Raw featured app right response:', JSON.stringify(featuredAppRight, null, 2));
  console.log('Featured app right exists:', !!featuredAppRight.featured_app_right);
  
  if (featuredAppRight.featured_app_right) {
    console.log('Featured app right contract ID:', featuredAppRight.featured_app_right.contract_id);
    console.log('Featured app right template ID:', featuredAppRight.featured_app_right.template_id);
    console.log('Featured app right created event blob length:', featuredAppRight.featured_app_right.created_event_blob?.length || 0);
  } else {
    console.log('WARNING: No featured app right found in response');
  }

  const {
    openMiningRound: openMiningRoundContractId,
  } = miningRoundContext;

  console.log('=== VALIDATION CHECKS ===');
  console.log('Open mining round contract ID:', openMiningRoundContractId);
  console.log('Featured app right contract ID for validation:', featuredAppRight.featured_app_right?.contract_id);

  if(!featuredAppRight.featured_app_right?.contract_id) {
    console.error('ERROR: No featured app right contract ID found - throwing error');
    throw new Error('No featured app right found');
  }

  console.log('=== BUILDING TRANSFER COMMAND ===');
  const featuredAppRightContractId = featuredAppRight.featured_app_right.contract_id;
  console.log('Using featured app right contract ID in command:', featuredAppRightContractId);

  // Create the transfer command using TransferPreapproval_Send
  const transferCommand: ExerciseCommand = {
    ExerciseCommand: {
      templateId: '#splice-amulet:Splice.AmuletRules:TransferPreapproval',
      contractId: params.transferPreapproval.contractId,
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
        inputs: params.inputs,
        amount: params.amount,
        sender: params.senderPartyId,
        description: params.description || null
      }
    }
  };

  console.log('=== TRANSFER COMMAND DEBUG ===');
  console.log('Transfer command choice argument context:', JSON.stringify(transferCommand.ExerciseCommand.choiceArgument['context'], null, 2));

  // Build disclosed contracts (TransferPreapproval contract details are provided explicitly)
  console.log('=== BUILDING DISCLOSED CONTRACTS ===');

  const transferPreapprovalContractInfo = createContractInfo(
    params.transferPreapproval.contractId,
    params.transferPreapproval.createdEventBlob,
    params.transferPreapproval.synchronizerId,
    params.transferPreapproval.templateId,
  );

  console.log('Transfer preapproval contract info:', JSON.stringify(transferPreapprovalContractInfo, null, 2));

  if(!amuletRules.amulet_rules.domain_id) {
    console.error(amuletRules.amulet_rules);
    throw new Error('Amulet rules domain ID is required');
  }

  // Build the full disclosed contracts list
  const disclosedContractsParams: any = {
    amuletRules: createContractInfo(
      amuletRules.amulet_rules.contract.contract_id,
      amuletRules.amulet_rules.contract.created_event_blob,
      amuletRules.amulet_rules.domain_id,
      amuletRules.amulet_rules.contract.template_id
    ),
    openMiningRound: miningRoundContext.openMiningRoundContract,
  };

  console.log('Base disclosed contracts params:', {
    amuletRules: disclosedContractsParams.amuletRules,
    openMiningRound: disclosedContractsParams.openMiningRound
  });

  if (featuredAppRight.featured_app_right) {
    console.log('=== ADDING FEATURED APP RIGHT TO DISCLOSED CONTRACTS ===');
    const featuredAppRightContractInfo = createContractInfo(
      featuredAppRight.featured_app_right.contract_id,
      featuredAppRight.featured_app_right.created_event_blob,
      amuletRules.amulet_rules.domain_id,
      featuredAppRight.featured_app_right.template_id
    );
    
    console.log('Featured app right contract info for disclosure:', JSON.stringify(featuredAppRightContractInfo, null, 2));
    disclosedContractsParams.featuredAppRight = featuredAppRightContractInfo;
  } else {
    console.log('WARNING: No featured app right to add to disclosed contracts');
  }

  if (transferPreapprovalContractInfo) {
    console.log('Adding transfer preapproval to additional contracts');
    disclosedContractsParams.additionalContracts = [transferPreapprovalContractInfo];
  }

  console.log('Final disclosed contracts params:', JSON.stringify(disclosedContractsParams, null, 2));

  const disclosedContracts = buildAmuletDisclosedContracts(disclosedContractsParams);
  console.log('Built disclosed contracts:', JSON.stringify(disclosedContracts, null, 2));

  // Submit the command
  console.log('=== SUBMITTING COMMAND ===');
  const submitParams: any = {
    commands: [transferCommand],
    commandId: `transfer-preapproved-${Date.now()}`,
    actAs: [params.senderPartyId],
    disclosedContracts,
  };

  console.log('Submit params:', JSON.stringify(submitParams, null, 2));

  const result = await ledgerClient.submitAndWaitForTransactionTree(submitParams);
  console.log('=== COMMAND RESULT ===');
  console.log('Transaction result:', JSON.stringify(result, null, 2));

  const finalResult = {
    contractId: params.transferPreapproval.contractId,
    domainId: amuletRules.amulet_rules.domain_id,
    transferResult: result,
  };

  console.log('=== FINAL RESULT ===');
  console.log('Final result:', JSON.stringify(finalResult, null, 2));
  console.log('=== TRANSFER TO PREAPPROVED DEBUG END ===');

  return finalResult;
}