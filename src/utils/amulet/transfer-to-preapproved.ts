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
  // Get network information
  const [amuletRules, miningRoundContext, featuredAppRight] = await Promise.all([
    validatorClient.getAmuletRules(),
    getCurrentMiningRoundContext(validatorClient),
    validatorClient.lookupFeaturedAppRight({ partyId: params.recipientPartyId })
  ]);

  const {
    openMiningRound: openMiningRoundContractId,
  } = miningRoundContext;

  if(!featuredAppRight.featured_app_right?.contract_id) {
    throw new Error('No featured app right found');
  }

  const featuredAppRightContractId = featuredAppRight.featured_app_right.contract_id;

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

  // Build disclosed contracts (TransferPreapproval contract details are provided explicitly)
  const transferPreapprovalContractInfo = createContractInfo(
    params.transferPreapproval.contractId,
    params.transferPreapproval.createdEventBlob,
    params.transferPreapproval.synchronizerId,
    params.transferPreapproval.templateId,
  );

  if(!amuletRules.amulet_rules.domain_id) {
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

  if (featuredAppRight.featured_app_right) {
    const featuredAppRightContractInfo = createContractInfo(
      featuredAppRight.featured_app_right.contract_id,
      featuredAppRight.featured_app_right.created_event_blob,
      amuletRules.amulet_rules.domain_id,
      featuredAppRight.featured_app_right.template_id
    );
    
    disclosedContractsParams.featuredAppRight = featuredAppRightContractInfo;
  }

  if (transferPreapprovalContractInfo) {
    disclosedContractsParams.additionalContracts = [transferPreapprovalContractInfo];
  }

  const disclosedContracts = buildAmuletDisclosedContracts(disclosedContractsParams);

  // Submit the command
  const submitParams: any = {
    commands: [transferCommand],
    commandId: `transfer-preapproved-${Date.now()}`,
    actAs: [params.senderPartyId],
    disclosedContracts,
  };

  const result = await ledgerClient.submitAndWaitForTransactionTree(submitParams);

  const finalResult = {
    contractId: params.transferPreapproval.contractId,
    domainId: amuletRules.amulet_rules.domain_id,
    transferResult: result,
  };

  return finalResult;
}