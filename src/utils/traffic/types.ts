import { type CostEstimation } from '../../clients/ledger-json-api/schemas/api/interactive-submission';

/** Traffic cost estimation breakdown for a transaction. */
export interface TrafficCostEstimate {
  /** Estimated traffic cost of the confirmation request. */
  requestCost: number;
  /** Estimated traffic cost of the confirmation response. */
  responseCost: number;
  /** Total estimated traffic cost (request + response). */
  totalCost: number;
  /** Timestamp when estimation was made (ISO 8601). */
  estimatedAt?: string;
}

/** Current traffic status for a participant/member. */
export interface TrafficStatus {
  /** Total traffic consumed on the synchronizer. */
  consumed: number;
  /** Current traffic limit. */
  limit: number;
  /** Total traffic purchased (may exceed limit while purchase is pending). */
  purchased: number;
}

/** Re-export the raw cost estimation type. */
export type { CostEstimation };
