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
    const typedCtr = ctr as JsGetActiveContractsResponseItem | LegacyContract;
    let payload: Record<string, unknown> | undefined;
    let templateId: string | undefined;
    let contractId: string | undefined;

    if ('contractEntry' in typedCtr && 'JsActiveContract' in typedCtr.contractEntry) {
      const { createdEvent } = typedCtr.contractEntry.JsActiveContract;
      payload = createdEvent.createArgument;
      ({ templateId, contractId } = createdEvent);
    } else if ('contract' in typedCtr) {
      const { contract } = typedCtr;
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
    const contractPayload = 'payload' in contract ? contract.payload : undefined;
    const payload = contractPayload ?? (contract as LegacyContract).contract?.contract?.payload ?? {};

    const contractRecord = contract as Record<string, unknown>;
    const templateId = 'templateId' in contract ? contract.templateId : undefined;

    // Extract owner/beneficiary based on contract type
    let ownerFull = '';
    if (templateId?.includes('AppRewardCoupon') || templateId?.includes('ValidatorRewardCoupon')) {
      // For coupons, beneficiary is optional and falls back to provider
      const beneficiary = payload['beneficiary'] as string | undefined;
      const provider = payload['provider'] as string | undefined;
      ownerFull = beneficiary ?? provider ?? '';
    } else {
      // For amulets, use owner field
      ownerFull =
        (payload['owner'] as string | undefined) ??
        (contractRecord['owner'] as string | undefined) ??
        (contractRecord['partyId'] as string | undefined) ??
        (contractRecord['party_id'] as string | undefined) ??
        '';
    }

    // Extract amount based on contract type
    let rawAmount: unknown = '0';
    if (templateId?.includes('AppRewardCoupon') || templateId?.includes('ValidatorRewardCoupon')) {
      // For coupons, amount is directly in payload
      rawAmount = payload['amount'] ?? '0';
    } else {
      // For amulets, amount might be nested
      const rawAmountCandidate =
        payload['amount'] ??
        contractRecord['amount'] ??
        contractRecord['effective_amount'] ??
        contractRecord['effectiveAmount'] ??
        contractRecord['initialAmount'] ??
        '0';

      rawAmount = rawAmountCandidate;
      if (typeof rawAmountCandidate === 'object') {
        rawAmount = (rawAmountCandidate as Record<string, unknown>)['initialAmount'] ?? '0';
      }
    }

    const numericAmount = parseFloat(rawAmount as string);
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

    // Extract amount based on contract type
    let effectiveAmount = '0';
    if (templateId.includes('AppRewardCoupon') || templateId.includes('ValidatorRewardCoupon')) {
      // For coupons, amount is directly in payload
      effectiveAmount = (payload['amount'] as string | undefined) ?? '0';
    } else {
      // For amulets, amount might be nested
      const amtObj = payload['amount'] ?? {};
      const intAmount = typeof amtObj === 'object' ? (amtObj as Record<string, unknown>)['initialAmount'] : amtObj;
      effectiveAmount = (intAmount as string | undefined) ?? '0';
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
