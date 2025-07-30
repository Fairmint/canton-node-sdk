import { LedgerJsonApiClient } from '../../clients/ledger-json-api';
import { ValidatorApiClient } from '../../clients/validator-api';
import { ExerciseCommand } from '../../clients/ledger-json-api/schemas/api/commands';
import { getCurrentMiningRoundContext } from './mining-rounds';

export interface TransferToPreapprovedParams {
  /** Party ID sending the transfer */
  senderPartyId: string;
  /** TransferPreapproval contract ID to use for the transfer */
  transferPreapprovalContractId: string;
  /** Amount to transfer */
  amount: string;
  /** Optional description for the transfer */
  description?: string;
  /** Amulet inputs to transfer */
  inputs: Array<{ tag: 'InputAmulet'; value: string }>;
  /** Contract details for disclosed contracts (optional - will be fetched if not provided) */
  contractDetails?: {
    amuletRules?: { createdEventBlob: string; synchronizerId: string };
    openMiningRound?: { createdEventBlob: string; synchronizerId: string };
    issuingMiningRounds?: Array<{ createdEventBlob: string; synchronizerId: string }>;
    featuredAppRight?: { createdEventBlob: string; synchronizerId: string };
  };
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
  // Get network information
  const [amuletRules, miningRoundContext, featuredAppRight] = await Promise.all([
    validatorClient.getAmuletRules(),
    getCurrentMiningRoundContext(validatorClient),
    validatorClient.lookupFeaturedAppRight({ partyId: params.senderPartyId })
  ]);

  const {
    openMiningRound: openMiningRoundContractId,
    issuingMiningRounds,
  } = miningRoundContext;

  // Create the transfer command using TransferPreapproval_Send
  const transferCommand: ExerciseCommand = {
    ExerciseCommand: {
      templateId: '#splice-amulet:Splice.AmuletRules:TransferPreapproval',
      contractId: params.transferPreapprovalContractId,
      choice: 'TransferPreapproval_Send',
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
        amount: params.amount,
        sender: params.senderPartyId,
        description: params.description || null
      }
    }
  };

  // Build disclosed contracts if contract details are provided
  let disclosedContracts: any[] | undefined;
  
  if (params.contractDetails) {
    disclosedContracts = [];
    
    // Add AmuletRules contract
    if (params.contractDetails.amuletRules) {
      disclosedContracts.push({
        contractId: amuletRules.amulet_rules.contract.contract_id,
        templateId: amuletRules.amulet_rules.contract.template_id,
        createdEventBlob: params.contractDetails.amuletRules.createdEventBlob,
        synchronizerId: params.contractDetails.amuletRules.synchronizerId,
      });
    }
    
    // Add open mining round contract
    if (openMiningRoundContractId && params.contractDetails.openMiningRound) {
      disclosedContracts.push({
        contractId: openMiningRoundContractId,
        createdEventBlob: params.contractDetails.openMiningRound.createdEventBlob,
        synchronizerId: params.contractDetails.openMiningRound.synchronizerId,
      });
    }
    
    // Add issuing mining rounds contracts
    if (params.contractDetails.issuingMiningRounds) {
      params.contractDetails.issuingMiningRounds.forEach((details, index) => {
        const contractId = issuingMiningRounds[index]?.contractId;
        if (contractId) {
          disclosedContracts!.push({
            contractId,
            createdEventBlob: details.createdEventBlob,
            synchronizerId: details.synchronizerId,
          });
        }
      });
    }
    
    // Add featured app right contract
    if (featuredAppRight.featured_app_right?.contract_id && params.contractDetails.featuredAppRight) {
      disclosedContracts.push({
        contractId: featuredAppRight.featured_app_right.contract_id,
        createdEventBlob: params.contractDetails.featuredAppRight.createdEventBlob,
        synchronizerId: params.contractDetails.featuredAppRight.synchronizerId,
      });
    }
  }

  // Submit the command
  const submitParams: any = {
    commands: [transferCommand],
    commandId: `transfer-preapproved-${Date.now()}`,
    actAs: [params.senderPartyId],
  };
  
  if (disclosedContracts) {
    submitParams.disclosedContracts = disclosedContracts;
  }
  
  const result = await ledgerClient.submitAndWaitForTransactionTree(submitParams);

  return {
    contractId: params.transferPreapprovalContractId,
    domainId: amuletRules.amulet_rules.domain_id || '',
    transferResult: result
  };
} 