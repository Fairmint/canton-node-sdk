import { LedgerJsonApiClient } from '../../clients/ledger-json-api';
import { ValidatorApiClient } from '../../clients/validator-api';
import { ExerciseCommand } from '../../clients/ledger-json-api/schemas/api/commands';
import { getCurrentMiningRoundContext } from './mining-rounds';
import { buildAmuletDisclosedContracts, createContractInfo } from './disclosed-contracts';

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
    /** TransferPreapproval contract details (optional) */
    transferPreapproval?: { createdEventBlob: string; synchronizerId: string };
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

  // Build disclosed contracts – always disclose required contracts, falling back to network lookups when
  // explicit contractDetails are not provided.

  // Determine TransferPreapproval contract info (createdEventBlob & synchronizerId)
  let transferPreapprovalContractInfo;

  if (params.contractDetails?.transferPreapproval) {
    transferPreapprovalContractInfo = createContractInfo(
      params.transferPreapprovalContractId,
      params.contractDetails.transferPreapproval.createdEventBlob,
      params.contractDetails.transferPreapproval.synchronizerId
    );
  } else {
    try {
      const preapprovalEvents = await ledgerClient.getEventsByContractId({
        contractId: params.transferPreapprovalContractId,
      } as any);

      const createdEventBlob = preapprovalEvents?.created?.createdEvent?.createdEventBlob;
      const synchronizerId = preapprovalEvents?.created?.synchronizerId;
      const templateId = preapprovalEvents?.created?.createdEvent?.templateId;

      if (createdEventBlob && synchronizerId) {
        transferPreapprovalContractInfo = createContractInfo(
          params.transferPreapprovalContractId,
          createdEventBlob,
          synchronizerId,
          templateId
        );
      }
    } catch {
      // Ignore fetch errors – the contract may be on the same synchronizer and not require disclosure
    }
  }

  // Build the full disclosed contracts list
  const disclosedContractsParams: any = {
    amuletRules: createContractInfo(
      amuletRules.amulet_rules.contract.contract_id,
      amuletRules.amulet_rules.contract.created_event_blob,
      amuletRules.amulet_rules.domain_id || '',
      amuletRules.amulet_rules.contract.template_id
    ),
    openMiningRound: miningRoundContext.openMiningRoundContract,
  };

  if (featuredAppRight.featured_app_right) {
    disclosedContractsParams.featuredAppRight = createContractInfo(
      featuredAppRight.featured_app_right.contract_id,
      featuredAppRight.featured_app_right.created_event_blob,
      featuredAppRight.featured_app_right.domain_id,
      featuredAppRight.featured_app_right.template_id
    );
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

  return {
    contractId: params.transferPreapprovalContractId,
    domainId: amuletRules.amulet_rules.domain_id || '',
    transferResult: result,
  };
}