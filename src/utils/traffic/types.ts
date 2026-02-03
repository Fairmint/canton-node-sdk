import { type CostEstimation } from '../../clients/ledger-json-api/schemas/api/interactive-submission';

/**
 * Default overhead for update ID confirmation (approximately 5KB). This is added to the base traffic cost to account
 * for confirmation messages.
 */
export const UPDATE_CONFIRMATION_OVERHEAD_BYTES = 5 * 1024; // 5KB

/** Default price per megabyte of traffic in cents. Based on $60/MB = 6000 cents/MB. */
export const DEFAULT_PRICE_PER_MB_CENTS = 6000;

/** Traffic cost estimation breakdown for a transaction. */
export interface TrafficCostEstimate {
  /** Estimated traffic cost of the confirmation request (bytes). */
  requestCost: number;
  /** Estimated traffic cost of the confirmation response (bytes). */
  responseCost: number;
  /** Total estimated traffic cost (request + response) in bytes. */
  totalCost: number;
  /** Total cost including update confirmation overhead (bytes). */
  totalCostWithOverhead: number;
  /** Estimated cost in cents (based on $60/MB pricing). */
  costInCents: number;
  /** Estimated cost in dollars (based on $60/MB pricing). */
  costInDollars: number;
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

/**
 * Calculates the cost in cents for a given number of bytes.
 *
 * Formula: pricePerMBCents * bytes / (1024 * 1024)
 *
 * @example
 *   ```typescript
 *   // 55KB of traffic at $60/MB
 *   const cents = calculateTrafficCostInCents(55 * 1024); // ~322 cents ($3.22)
 *   ```;
 *
 * @param bytes - Total traffic in bytes
 * @param pricePerMBCents - Price per MB in cents (default: 6000 = $60/MB)
 * @returns Cost in cents
 */
export function calculateTrafficCostInCents(
  bytes: number,
  pricePerMBCents: number = DEFAULT_PRICE_PER_MB_CENTS
): number {
  return (pricePerMBCents * bytes) / (1024 * 1024);
}

/**
 * Calculates the cost in dollars for a given number of bytes.
 *
 * @example
 *   ```typescript
 *   // 55KB of traffic at $60/MB
 *   const dollars = calculateTrafficCostInDollars(55 * 1024); // ~$3.22
 *   ```;
 *
 * @param bytes - Total traffic in bytes
 * @param pricePerMBCents - Price per MB in cents (default: 6000 = $60/MB)
 * @returns Cost in dollars
 */
export function calculateTrafficCostInDollars(
  bytes: number,
  pricePerMBCents: number = DEFAULT_PRICE_PER_MB_CENTS
): number {
  return calculateTrafficCostInCents(bytes, pricePerMBCents) / 100;
}

/** Re-export the raw cost estimation type. */
export type { CostEstimation };
