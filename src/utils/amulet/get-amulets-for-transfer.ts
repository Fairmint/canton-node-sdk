import { type LedgerJsonApiClient } from '../../clients/ledger-json-api';
import { type JsGetActiveContractsResponseItem } from '../../clients/ledger-json-api/schemas/api/state';

export interface AmuletForTransfer {
  contractId: string;
  templateId: string;
  effectiveAmount: string;
  owner: string;
}

export type TransferInputForTransfer =
  | { tag: 'InputAmulet'; contractId: string; templateId: string; effectiveAmount: string; owner: string }
  | {
      tag: 'InputAppRewardCoupon';
      contractId: string;
      templateId: string;
      effectiveAmount: string;
      beneficiary: string;
    }
  | {
      tag: 'InputValidatorRewardCoupon';
      contractId: string;
      templateId: string;
      effectiveAmount: string;
      beneficiary: string;
    };

export interface GetAmuletsForTransferParams {
  /** Ledger JSON API client for querying active contracts */
  jsonApiClient: LedgerJsonApiClient;
  /** Party IDs to read as (first one is used as sender) */
  readAs?: string[];
  /**
   * If true, returns all valid transfer inputs (Amulet, AppRewardCoupon, ValidatorRewardCoupon). Defaults to false
   * (only Amulet).
   */
  includeAllTransferInputs?: boolean;
}

/** Legacy contract format for backward compatibility */
interface LegacyContract {
  payload?: Record<string, unknown>;
  contract?: {
    template_id?: string;
    contract_id?: string;
    payload?: Record<string, unknown>;
    contract?: {
      template_id?: string;
      contract_id?: string;
      payload?: Record<string, unknown>;
    };
  };
  template_id?: string;
  contract_id?: string;
}

/** Internal contract representation with extracted data */
interface ContractData {
  contractId: string;
  templateId: string;
  payload: Record<string, unknown>;
}

/** Type guard to check if a value is a non-null object */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Type guard to check if a value has a specific property */
function hasProperty<K extends string>(obj: unknown, key: K): obj is Record<K, unknown> {
  return isRecord(obj) && key in obj;
}

/** Type guard to check if a contract is a JsGetActiveContractsResponseItem with JsActiveContract */
function isJsActiveContractItem(ctr: unknown): ctr is JsGetActiveContractsResponseItem & {
  contractEntry: {
    JsActiveContract: {
      createdEvent: { templateId: string; contractId: string; createArgument: Record<string, unknown> };
    };
  };
} {
  if (!isRecord(ctr)) return false;

  const entry = ctr['contractEntry'];
  if (!isRecord(entry)) return false;

  const jsActive = entry['JsActiveContract'];
  if (!isRecord(jsActive)) return false;

  return hasProperty(jsActive, 'createdEvent');
}

/** Type guard to check if a contract is a LegacyContract with contract property */
function isLegacyContractWithContract(
  ctr: unknown
): ctr is LegacyContract & { contract: NonNullable<LegacyContract['contract']> } {
  if (!isRecord(ctr)) return false;
  return isRecord(ctr['contract']);
}

/** Safely extract a string from an unknown value */
function extractString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** Safely extract a number or string from an unknown value */
function extractNumericValue(value: unknown): string | number | undefined {
  if (typeof value === 'string' || typeof value === 'number') return value;
  return undefined;
}

/**
 * Gets unlocked amulets owned by the sender party that can be used for transfers. Optionally returns all valid transfer
 * inputs (Amulet, AppRewardCoupon, ValidatorRewardCoupon).
 *
 * @param params - Parameters for getting transfer inputs
 * @returns Promise resolving to array of transfer inputs suitable for transfer
 */
export async function getAmuletsForTransfer(params: GetAmuletsForTransferParams): Promise<AmuletForTransfer[]> {
  const { jsonApiClient, readAs, includeAllTransferInputs } = params;

  // Query ledger for active contracts for this party
  if (!readAs?.[0]) {
    return [];
  }
  const senderParty = readAs[0];

  // Build template IDs to query based on includeAllTransferInputs flag
  const templateIds = includeAllTransferInputs
    ? [
        '#splice-amulet:Splice.Amulet:Amulet',
        '#splice-amulet:Splice.Amulet:AppRewardCoupon',
        '#splice-amulet:Splice.Amulet:ValidatorRewardCoupon',
      ]
    : ['#splice-amulet:Splice.Amulet:Amulet'];

  const activeContracts = await jsonApiClient.getActiveContracts({
    parties: [senderParty],
    templateIds,
  });

  const allContracts: ContractData[] = [];
  const contractsArr = Array.isArray(activeContracts) ? activeContracts : [];

  contractsArr.forEach((ctr) => {
    let payload: Record<string, unknown> | undefined;
    let templateId: string | undefined;
    let contractId: string | undefined;

    // Use type guards for proper runtime validation
    if (isJsActiveContractItem(ctr)) {
      const jsActiveContract = ctr.contractEntry['JsActiveContract'];
      const { createdEvent } = jsActiveContract;
      payload = createdEvent.createArgument;
      ({ templateId, contractId } = createdEvent);
    } else if (isLegacyContractWithContract(ctr)) {
      const { contract } = ctr;
      ({ payload } = contract);
      templateId = contract.contract?.template_id ?? contract.template_id;
      contractId = contract.contract?.contract_id ?? contract.contract_id;
    }

    if (!payload || !templateId || !contractId) return;

    // Filter for valid transfer input contracts
    const isUnlockedAmulet = templateId.includes('Splice.Amulet:Amulet') && !templateId.includes('LockedAmulet');
    const isAppRewardCoupon = templateId.includes('AppRewardCoupon');
    const isValidatorRewardCoupon = templateId.includes('ValidatorRewardCoupon');

    if (!isUnlockedAmulet && !isAppRewardCoupon && !isValidatorRewardCoupon) return;

    allContracts.push({ contractId, templateId, payload });
  });

  // Helper to extract owner/beneficiary and numeric amount from diverse contract shapes
  const extract = (contract: ContractData | LegacyContract) => {
    // Get payload using type-safe access
    let payload: Record<string, unknown>;
    if ('templateId' in contract && 'payload' in contract) {
      // ContractData - has payload directly
      ({ payload } = contract);
    } else if ('contract' in contract) {
      // LegacyContract with nested structure
      payload = contract.contract.contract?.payload ?? contract.contract.payload ?? {};
    } else {
      payload = {};
    }

    // Get templateId using type-safe access
    const templateId = 'templateId' in contract ? contract.templateId : undefined;

    // Extract owner/beneficiary based on contract type using safe extraction
    let ownerFull = '';
    if (templateId?.includes('AppRewardCoupon') || templateId?.includes('ValidatorRewardCoupon')) {
      // For coupons, beneficiary is optional and falls back to provider
      ownerFull = extractString(payload['beneficiary']) ?? extractString(payload['provider']) ?? '';
    } else {
      // For amulets, use owner field - check multiple possible locations
      ownerFull =
        extractString(payload['owner']) ??
        extractString(payload['partyId']) ??
        extractString(payload['party_id']) ??
        '';
    }

    // Extract amount based on contract type
    let rawAmount: string | number = '0';
    if (templateId?.includes('AppRewardCoupon') || templateId?.includes('ValidatorRewardCoupon')) {
      // For coupons, amount is directly in payload
      rawAmount = extractNumericValue(payload['amount']) ?? '0';
    } else {
      // For amulets, amount might be nested
      const rawAmountCandidate =
        payload['amount'] ?? payload['effective_amount'] ?? payload['effectiveAmount'] ?? payload['initialAmount'];

      const directValue = extractNumericValue(rawAmountCandidate);
      if (directValue !== undefined) {
        rawAmount = directValue;
      } else if (isRecord(rawAmountCandidate)) {
        // Amount might be nested in an object with initialAmount
        rawAmount = extractNumericValue(rawAmountCandidate['initialAmount']) ?? '0';
      }
    }

    const numericAmount = typeof rawAmount === 'number' ? rawAmount : parseFloat(rawAmount);
    return { owner: ownerFull, numericAmount };
  };

  // Filter contracts owned by sender (readAs[0]) and with positive balance
  const partyContracts = allContracts.filter((c) => {
    const { owner, numericAmount } = extract(c);
    return numericAmount > 0 && owner === senderParty;
  });

  if (partyContracts.length === 0) {
    return [];
  }

  // Sort biggest → smallest so we pick high-value contracts first
  partyContracts.sort((a, b) => extract(b).numericAmount - extract(a).numericAmount);

  // Map to the structure expected by buildAmuletInputs (maintaining backward compatibility)
  const result = partyContracts.map((c) => {
    const { payload, templateId } = c;

    // Extract amount based on contract type using safe extraction
    let effectiveAmount = '0';
    if (templateId.includes('AppRewardCoupon') || templateId.includes('ValidatorRewardCoupon')) {
      // For coupons, amount is directly in payload
      const couponAmount = extractNumericValue(payload['amount']);
      effectiveAmount = couponAmount !== undefined ? String(couponAmount) : '0';
    } else {
      // For amulets, amount might be nested
      const amtObj = payload['amount'];
      if (typeof amtObj === 'string') {
        effectiveAmount = amtObj;
      } else if (typeof amtObj === 'number') {
        effectiveAmount = String(amtObj);
      } else if (isRecord(amtObj)) {
        const nestedAmount = extractNumericValue(amtObj['initialAmount']);
        effectiveAmount = nestedAmount !== undefined ? String(nestedAmount) : '0';
      }
    }

    return {
      contractId: c.contractId,
      templateId: c.templateId,
      effectiveAmount,
      owner: extract(c).owner,
    };
  });

  return result;
}
