import { type LockedAmulet, type LockedAmuletSelectionOptions } from './types';

function isExpired(lockExpiresAt: string | null, nowMs: number): boolean {
  if (!lockExpiresAt) {
    return false;
  }
  const parsed = Date.parse(lockExpiresAt);
  if (Number.isNaN(parsed)) {
    return false;
  }
  return parsed <= nowMs;
}

/**
 * Select a locked amulet that can fund the required amount. By default the smallest qualifying amulet is returned to
 * avoid overspending.
 */
export function selectLockedAmuletForAmount(
  amulets: LockedAmulet[],
  amountNeeded: number,
  options: LockedAmuletSelectionOptions = {}
): LockedAmulet | null {
  if (!Number.isFinite(amountNeeded) || amountNeeded <= 0) {
    throw new Error('selectLockedAmuletForAmount requires a positive amountNeeded');
  }

  const { requireExclusiveHolder = true, rejectExpiredLocks = true, nowMs = Date.now() } = options;

  const candidates = amulets
    .filter((amulet) => amulet.effectiveAmount >= amountNeeded)
    .filter((amulet) => {
      if (requireExclusiveHolder && amulet.holders.length > 1) {
        return false;
      }
      if (rejectExpiredLocks && isExpired(amulet.lockExpiresAt, nowMs)) {
        return false;
      }
      return true;
    })
    .sort((a, b) => a.effectiveAmount - b.effectiveAmount);

  return candidates.length > 0 ? candidates[0]! : null;
}
