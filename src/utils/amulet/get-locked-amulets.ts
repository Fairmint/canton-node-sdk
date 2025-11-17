import { type ValidatorApiClient } from '../../clients/validator-api';
import type { GetAmuletsResponse } from '../../clients/validator-api/schemas/api/wallet';
import { type LockedAmulet } from './types';

function assertString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function parseEffectiveAmount(raw: string | undefined, label: string): number {
  const parsed = Number.parseFloat(raw ?? '0');
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} has an invalid effective amount (${raw ?? 'undefined'})`);
  }
  return parsed;
}

function parseHolders(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map((holder) => {
      if (typeof holder === 'string') {
        return holder;
      }
      if (holder && typeof holder === 'object' && typeof (holder as { owner?: string }).owner === 'string') {
        return (holder as { owner: string }).owner;
      }
      return null;
    })
    .filter((holder): holder is string => typeof holder === 'string' && holder.trim() !== '');
}

type LockedAmuletEntry = GetAmuletsResponse['locked_amulets'][number];

function toLockedAmulet(entry: LockedAmuletEntry, index: number): LockedAmulet {
  const label = `locked amulet #${index + 1}`;
  const contract = entry.contract.contract;
  const payload = (contract.payload ?? {}) as Record<string, unknown>;
  const amuletPayload = (payload.amulet ?? {}) as Record<string, unknown>;
  const lockPayload = (payload.lock ?? {}) as Record<string, unknown>;

  const contractId = assertString(contract.contract_id, `${label} contract_id`);
  const templateId = assertString(contract.template_id, `${label} template_id`);
  const owner = assertString(amuletPayload.owner, `${label} owner`);
  const holders = parseHolders(lockPayload.holders);
  const lockExpiresAt = typeof lockPayload.expiresAt === 'string' ? lockPayload.expiresAt : null;
  const effectiveAmount = parseEffectiveAmount(entry.effective_amount, `${label} effective_amount`);
  const domainId = assertString(entry.contract.domain_id, `${label} domain_id`);
  const createdEventBlob = assertString(contract.created_event_blob, `${label} created_event_blob`);

  return {
    contractId,
    templateId,
    owner,
    holders,
    lockExpiresAt,
    effectiveAmount,
    domainId,
    createdEventBlob,
  };
}

/**
 * Fetch locked amulets for the authenticated validator and filter them for the provided party ID.
 * This intentionally enforces the canonical JsActiveContract shape so unexpected API responses fail fast.
 */
export async function getLockedAmuletsForParty(
  validatorClient: ValidatorApiClient,
  ownerPartyId: string
): Promise<LockedAmulet[]> {
  const response = await validatorClient.getAmulets();
  const lockedEntries = response.locked_amulets ?? [];
  const normalizedOwner = ownerPartyId.toLowerCase();

  return lockedEntries
    .map((entry, index) => toLockedAmulet(entry, index))
    .filter((amulet) => amulet.owner.toLowerCase() === normalizedOwner);
}

