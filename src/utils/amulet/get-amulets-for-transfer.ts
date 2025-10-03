import { type LedgerJsonApiClient } from '../../clients/ledger-json-api';
import { type JsGetActiveContractsResponseItem } from '../../clients/ledger-json-api/schemas/api/state';

export interface AmuletForTransfer {
  contractId: string;
  templateId: string;
  effectiveAmount: string;
  owner: string;
}

export interface GetAmuletsForTransferParams {
  /** Ledger JSON API client for querying active contracts */
  jsonApiClient: LedgerJsonApiClient;
  /** Party IDs to read as (first one is used as sender) */
  readAs?: string[];
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

/** Internal amulet representation with extracted data */
interface AmuletData {
  contractId: string;
  templateId: string;
  payload: Record<string, unknown>;
}

/**
 * Gets unlocked amulets owned by the sender party that can be used for transfers
 *
 * @param params - Parameters for getting amulets
 * @returns Promise resolving to array of amulets suitable for transfer
 */
export async function getAmuletsForTransfer(params: GetAmuletsForTransferParams): Promise<AmuletForTransfer[]> {
  const { jsonApiClient, readAs } = params;

  // Query ledger for active contracts for this party (unlocked amulets)
  if (!readAs?.[0]) {
    return [];
  }
  const senderParty = readAs[0];

  const activeContracts = await jsonApiClient.getActiveContracts({
    parties: [senderParty],
  });

  const allAmulets: AmuletData[] = [];
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

    const isUnlockedAmulet = templateId.includes('Splice.Amulet:Amulet') && !templateId.includes('LockedAmulet');
    if (!isUnlockedAmulet) return;

    allAmulets.push({ contractId, templateId, payload });
  });

  // Helper to extract owner and numeric amount from diverse amulet shapes
  const extract = (amulet: AmuletData | LegacyContract) => {
    const amuletPayload = 'payload' in amulet ? amulet.payload : undefined;
    const payload = amuletPayload ?? (amulet as LegacyContract).contract?.contract?.payload ?? {};

    const amuletRecord = amulet as Record<string, unknown>;
    const ownerFull =
      (payload['owner'] as string | undefined) ??
      (amuletRecord['owner'] as string | undefined) ??
      (amuletRecord['partyId'] as string | undefined) ??
      (amuletRecord['party_id'] as string | undefined) ??
      '';

    const rawAmountCandidate =
      payload['amount'] ??
      amuletRecord['amount'] ??
      amuletRecord['effective_amount'] ??
      amuletRecord['effectiveAmount'] ??
      amuletRecord['initialAmount'] ??
      '0';

    let rawAmount = rawAmountCandidate;
    if (typeof rawAmountCandidate === 'object') {
      rawAmount = (rawAmountCandidate as Record<string, unknown>)['initialAmount'] ?? '0';
    }

    const numericAmount = parseFloat(rawAmount as string);
    return { owner: ownerFull, numericAmount };
  };

  // Note: Processing amulets to extract contract information

  // Keep amulets owned by sender (readAs[0]) and with positive balance
  const partyAmulets = allAmulets.filter((a) => {
    const { owner, numericAmount } = extract(a);
    return numericAmount > 0 && owner === senderParty;
  });

  if (partyAmulets.length === 0) {
    return [];
  }

  // Sort biggest → smallest so we pick high-value amulets first
  partyAmulets.sort((a, b) => extract(b).numericAmount - extract(a).numericAmount);

  // Note: partyAmulets is now sorted by amount (biggest first)

  // Map to the structure expected by buildAmuletInputs
  const result = partyAmulets.map((a) => {
    const { payload } = a;
    const amtObj = payload['amount'] ?? {};
    const intAmount = typeof amtObj === 'object' ? (amtObj as Record<string, unknown>)['initialAmount'] : amtObj;

    return {
      contractId: a.contractId,
      templateId: a.templateId,
      effectiveAmount: (intAmount as string | undefined) ?? '0',
      owner: (payload['owner'] as string | undefined) ?? extract(a).owner,
    };
  });

  return result;
}
