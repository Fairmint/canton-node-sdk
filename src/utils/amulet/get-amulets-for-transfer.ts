import { type LedgerJsonApiClient } from '../../clients/ledger-json-api';
import { type JsGetActiveContractsResponseItem } from '../../clients/ledger-json-api/schemas/api/state';
import { isRecord } from '../../core/utils';

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

/** Internal contract representation with extracted data */
interface ContractData {
  contractId: string;
  templateId: string;
  payload: Record<string, unknown>;
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

  if (!('createdEvent' in jsActive)) return false;

  const { createdEvent } = jsActive;
  if (!isRecord(createdEvent)) return false;

  // Validate all required fields exist and are strings
  if (typeof createdEvent['contractId'] !== 'string') return false;
  if (typeof createdEvent['templateId'] !== 'string') return false;
  if (!isRecord(createdEvent['createArgument'])) return false;

  return true;
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
 * Extract the effective amount from a contract payload. For Amulets: amount is nested as { initialAmount: string } For
 * Coupons: amount is directly a string
 */
function extractAmount(payload: Record<string, unknown>, templateId: string): string {
  if (templateId.includes('AppRewardCoupon') || templateId.includes('ValidatorRewardCoupon')) {
    // For coupons, amount is directly in payload
    const amount = extractNumericValue(payload['amount']);
    return amount !== undefined ? String(amount) : '0';
  }

  // For amulets, amount is nested: { initialAmount: string }
  const amountObj = payload['amount'];
  if (isRecord(amountObj)) {
    const initialAmount = extractNumericValue(amountObj['initialAmount']);
    return initialAmount !== undefined ? String(initialAmount) : '0';
  }

  // Direct amount value (shouldn't happen with current API but handle gracefully)
  const directAmount = extractNumericValue(amountObj);
  return directAmount !== undefined ? String(directAmount) : '0';
}

/** Extract the owner from a contract payload. For Amulets: owner field For Coupons: beneficiary or provider field */
function extractOwner(payload: Record<string, unknown>, templateId: string): string {
  if (templateId.includes('AppRewardCoupon') || templateId.includes('ValidatorRewardCoupon')) {
    // For coupons, beneficiary is optional and falls back to provider
    return extractString(payload['beneficiary']) ?? extractString(payload['provider']) ?? '';
  }

  // For amulets, use owner field
  return extractString(payload['owner']) ?? '';
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

  for (const ctr of contractsArr) {
    // Only handle the canonical JsActiveContract format
    if (!isJsActiveContractItem(ctr)) {
      continue;
    }

    const { createdEvent } = ctr.contractEntry.JsActiveContract;
    const { templateId, contractId, createArgument: payload } = createdEvent;

    // Filter for valid transfer input contracts
    const isUnlockedAmulet = templateId.includes('Splice.Amulet:Amulet') && !templateId.includes('LockedAmulet');
    const isAppRewardCoupon = templateId.includes('AppRewardCoupon');
    const isValidatorRewardCoupon = templateId.includes('ValidatorRewardCoupon');

    if (!isUnlockedAmulet && !isAppRewardCoupon && !isValidatorRewardCoupon) {
      continue;
    }

    allContracts.push({ contractId, templateId, payload });
  }

  // Filter contracts owned by sender and with positive balance
  const partyContracts = allContracts.filter((c) => {
    const owner = extractOwner(c.payload, c.templateId);
    const amount = parseFloat(extractAmount(c.payload, c.templateId));
    return amount > 0 && owner === senderParty;
  });

  if (partyContracts.length === 0) {
    return [];
  }

  // Sort biggest → smallest so we pick high-value contracts first
  partyContracts.sort((a, b) => {
    const amountA = parseFloat(extractAmount(a.payload, a.templateId));
    const amountB = parseFloat(extractAmount(b.payload, b.templateId));
    return amountB - amountA;
  });

  // Map to the output structure
  return partyContracts.map((c) => ({
    contractId: c.contractId,
    templateId: c.templateId,
    effectiveAmount: extractAmount(c.payload, c.templateId),
    owner: extractOwner(c.payload, c.templateId),
  }));
}
