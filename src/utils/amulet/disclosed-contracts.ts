import { DisclosedContract } from '../../clients/ledger-json-api/schemas/api/commands';

export interface ContractInfo {
  /** Contract ID */
  contractId: string;
  /** Template ID (optional) */
  templateId?: string | undefined;
  /** Created event blob */
  createdEventBlob: string;
  /** Synchronizer ID */
  synchronizerId: string;
}

export interface AmuletDisclosedContractsParams {
  /** AmuletRules contract info */
  amuletRules: ContractInfo;
  /** Open mining round contract info */
  openMiningRound?: ContractInfo;
  /** Issuing mining rounds contract info */
  issuingMiningRounds?: ContractInfo[];
  /** Featured app right contract info */
  featuredAppRight?: ContractInfo;
  /** Additional contracts to disclose */
  additionalContracts?: ContractInfo[];
}

/**
 * Builds disclosed contracts array for Amulet operations
 * 
 * @param params - Contract information for disclosure
 * @returns Array of disclosed contracts
 */
export function buildAmuletDisclosedContracts(
  params: AmuletDisclosedContractsParams
): DisclosedContract[] {
  const disclosedContracts: DisclosedContract[] = [];

  // Add AmuletRules contract (required)
  disclosedContracts.push({
    contractId: params.amuletRules.contractId,
    templateId: params.amuletRules.templateId,
    createdEventBlob: params.amuletRules.createdEventBlob,
    synchronizerId: params.amuletRules.synchronizerId,
  });

  // Add open mining round contract if provided
  if (params.openMiningRound) {
    disclosedContracts.push({
      contractId: params.openMiningRound.contractId,
      templateId: params.openMiningRound.templateId,
      createdEventBlob: params.openMiningRound.createdEventBlob,
      synchronizerId: params.openMiningRound.synchronizerId,
    });
  }

  // Add issuing mining rounds contracts if provided
  if (params.issuingMiningRounds) {
    for (const round of params.issuingMiningRounds) {
      disclosedContracts.push({
        contractId: round.contractId,
        templateId: round.templateId,
        createdEventBlob: round.createdEventBlob,
        synchronizerId: round.synchronizerId,
      });
    }
  }

  // Add featured app right contract if provided
  if (params.featuredAppRight) {
    disclosedContracts.push({
      contractId: params.featuredAppRight.contractId,
      templateId: params.featuredAppRight.templateId,
      createdEventBlob: params.featuredAppRight.createdEventBlob,
      synchronizerId: params.featuredAppRight.synchronizerId,
    });
  }

  // Add additional contracts if provided
  if (params.additionalContracts) {
    for (const contract of params.additionalContracts) {
      disclosedContracts.push({
        contractId: contract.contractId,
        templateId: contract.templateId,
        createdEventBlob: contract.createdEventBlob,
        synchronizerId: contract.synchronizerId,
      });
    }
  }

  return disclosedContracts;
}

/**
 * Helper function to create ContractInfo from API responses
 * 
 * @param contractId - The contract ID
 * @param templateId - The template ID (optional)
 * @param createdEventBlob - The created event blob
 * @param synchronizerId - The synchronizer ID
 * @returns ContractInfo object
 */
export function createContractInfo(
  contractId: string,
  createdEventBlob: string,
  synchronizerId: string,
  templateId?: string
): ContractInfo {
  return {
    contractId,
    ...(templateId && { templateId }),
    createdEventBlob,
    synchronizerId,
  };
} 