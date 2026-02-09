import { type ContractId, type DomainId, type PartyId, type TemplateId } from '../../core/branded-types';

export interface LockedAmulet {
  readonly contractId: ContractId;
  readonly templateId: TemplateId;
  readonly owner: PartyId;
  readonly effectiveAmount: number;
  readonly holders: readonly PartyId[];
  readonly lockExpiresAt: string | null;
  readonly domainId: DomainId;
  readonly createdEventBlob: string;
}

export interface LockedAmuletSelectionOptions {
  /**
   * When true, reject locked amulets that list multiple holders. Defaults to true because multi-holder locks require
   * extra coordination.
   */
  readonly requireExclusiveHolder?: boolean;
  /** When true, reject locks that have already expired (based on lockExpiresAt timestamp). Defaults to true. */
  readonly rejectExpiredLocks?: boolean;
  /** Override the clock used for expiration checks (defaults to Date.now()). */
  readonly nowMs?: number;
}
