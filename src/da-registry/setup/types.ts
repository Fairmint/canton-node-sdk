/**
 * Types for the declarative DA Registry setup: the declared state of one instrument on Digital Asset's Registry, and
 * the ordered steps that converge a ledger to it.
 *
 * The setup is a list of ordered steps. Each step reads the ledger and DA's API, says whether its part of the declared
 * state already holds, and if not, which ledger commands would make it hold. `plan` prints that; `apply` submits it and
 * re-reads.
 */
import { type LedgerSubmission } from '../../utils/ledger';
import { type DaRegistryApi } from '../api-client';
import { type DaRegistryLedger } from '../ledger';
import { type DaRegistryPackageRequirement } from '../packages';
import { type ClaimSpec } from '../readers';

/** The Canton network a declared state targets. On MainNet the setup never rewrites a live instrument configuration. */
export type DaRegistrySetupNetwork = 'devnet' | 'testnet' | 'mainnet';

/**
 * The two claims an instrument requires: `transfer` to send or receive (settlement included), `redemption` to receive a
 * mint or burn.
 */
export type DaRegistrySetupClaimKind = 'transfer' | 'redemption';

/** One allowlisted party and the claims its credential grants. */
export interface DaRegistrySetupCredentialEntry {
  /** Off-ledger label for logs only. Never written on-ledger. */
  label: string;
  party: string;
  claims: DaRegistrySetupClaimKind[];
}

/** A receiver the ledger user acts for, which gets a transfer preapproval for the instrument. */
export interface DaRegistrySetupPreapproval {
  /** Off-ledger label for logs only. */
  label: string;
  party: string;
}

/** A holder the registrar tops up from its own holdings. */
export interface DaRegistrySetupDelivery {
  /** Off-ledger label for logs only. */
  label: string;
  party: string;
  /** Delivery tops the holder up to this balance from the registrar's holdings. Decimal string. */
  minBalance: string;
}

/**
 * The declared state of one instrument on DA's Registry, issued by one party acting as both DA provider and registrar.
 *
 * The setup trusts this value: validate it (unique parties, the registrar holding both claims, deliveries backed by
 * supply, and so on) before building the steps.
 */
export interface DaRegistrySetupConfig {
  network: DaRegistrySetupNetwork;
  /**
   * Where the declared state comes from (for example a file path). Named in notes that ask a person to change it;
   * defaults to "the config".
   */
  source?: string;
  ledger: {
    synchronizerId: string;
    /** A name for the ledger connection (for example the node provider), used in operator text only. */
    name?: string;
  };
  /** The party that is both DA provider and registrar, and issues and holds every credential. */
  registrar: {
    party: string;
  };
  da: {
    /** DA's off-ledger Registry API base URL for this network. */
    apiUrl: string;
    /** DA's operator party on this network. A network reset changes it, and every registry contract names it. */
    operatorParty: string;
    /** How long `apply` polls for DA's operator to accept the provider request. */
    providerApprovalTimeoutMinutes: number;
    /** DA's packages the node operator keeps on the registrar's node; the setup checks them and never uploads. */
    packages: {
      required: DaRegistryPackageRequirement[];
    };
  };
  instrument: {
    id: string;
    claims: Record<DaRegistrySetupClaimKind, ClaimSpec>;
    useBlockList: boolean;
  };
  /** The allowlist: one registrar-issued, registrar-held credential per listed party. */
  credentials: {
    /** On-ledger credential id; every counterparty sees it, so no personal data. */
    id: string;
    /** On-ledger credential description; no personal data. */
    description: string;
    /** ISO timestamp every credential is valid until. */
    validUntil: string;
    /** The credentials step blocks once `validUntil` is within this many days. */
    renewWithinDays: number;
    /** Revoke registrar-issued credentials for this instrument that name parties not listed. */
    pruneUnlisted: boolean;
    parties: DaRegistrySetupCredentialEntry[];
  };
  /** Receivers the ledger user acts for; each gets a transfer preapproval for the instrument. */
  preapprovals: DaRegistrySetupPreapproval[];
  /**
   * Test supply: the registrar mints to itself until total supply reaches `total`, including after test burns. `null`
   * leaves supply alone (where real mints follow an off-ledger process).
   */
  supply: { total: string } | null;
  /** Test deliveries: each holder is topped up to `minBalance` from the registrar's holdings, including after it trades. */
  deliveries: DaRegistrySetupDelivery[];
}

/** Everything a step reads from or acts on. */
export interface DaRegistrySetupContext {
  config: DaRegistrySetupConfig;
  ledger: DaRegistryLedger;
  da: DaRegistryApi;
  now: () => Date;
  log: (line: string) => void;
}

/**
 * - `done`: the declared state holds.
 * - `pending`: `apply` would submit `actions`.
 * - `waiting`: someone else must act (DA's operator, a holder); re-run later.
 * - `blocked`: cannot proceed until an earlier step is done or a person fixes something; see `notes`.
 */
export type DaRegistrySetupStepStatus = 'done' | 'pending' | 'waiting' | 'blocked';

/** One ledger submission a step plans. */
export interface DaRegistrySetupAction {
  description: string;
  /** Ledger commands, printed in full by `plan` and submitted by `apply`. */
  submission: LedgerSubmission;
}

/** What a step found, and what `apply` would do about it. */
export interface DaRegistrySetupStepAssessment {
  status: DaRegistrySetupStepStatus;
  summary: string;
  /** `blocked` only because an earlier step is not done yet; resolves itself once that step is applied. */
  dependency?: boolean;
  /**
   * For `waiting`: whether polling can help (DA's indexer will catch up) or only another party can (a holder creating
   * its preapproval). Defaults to true.
   */
  poll?: boolean;
  evidence?: Record<string, string>;
  notes?: string[];
  actions?: DaRegistrySetupAction[];
}

/** Thrown by a step's reads when an earlier step must be done first; the runner reports it as a dependency. */
export class DaRegistrySetupDependencyError extends Error {
  constructor(
    readonly stepId: string,
    detail: string
  ) {
    super(detail);
    this.name = 'DaRegistrySetupDependencyError';
  }
}

/** One ordered setup step. */
export interface DaRegistrySetupStep {
  id: string;
  title: string;
  /** Why the step exists. Printed by `plan`. */
  why: string;
  assess: () => Promise<DaRegistrySetupStepAssessment>;
  /**
   * In `apply`, poll `assess` while the step is `waiting`, for up to this long. Used where another party completes the
   * step: DA's operator accepting the provider request, or DA's API indexing a new contract.
   */
  awaitMs?: number;
}
