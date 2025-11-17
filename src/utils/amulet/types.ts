export interface LockedAmulet {
  contractId: string;
  templateId: string;
  owner: string;
  effectiveAmount: number;
  holders: string[];
  lockExpiresAt: string | null;
  domainId: string;
  createdEventBlob: string;
}

export interface LockedAmuletSelectionOptions {
  /**
   * When true, reject locked amulets that list multiple holders.
   * Defaults to true because multi-holder locks require extra coordination.
   */
  requireExclusiveHolder?: boolean;
  /**
   * When true, reject locks that have already expired (based on lockExpiresAt timestamp).
   * Defaults to true.
   */
  rejectExpiredLocks?: boolean;
  /**
   * Override the clock used for expiration checks (defaults to Date.now()).
   */
  nowMs?: number;
}

