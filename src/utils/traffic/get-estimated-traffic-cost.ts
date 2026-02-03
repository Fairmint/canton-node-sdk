import { type InteractiveSubmissionPrepareResponse } from '../../clients/ledger-json-api/schemas/api/interactive-submission';
import {
  calculateTrafficCostInCents,
  calculateTrafficCostInDollars,
  type TrafficCostEstimate,
  UPDATE_CONFIRMATION_OVERHEAD_BYTES,
} from './types';

/**
 * Extracts traffic cost estimation from a prepared transaction response.
 *
 * The cost estimation is returned by the Ledger JSON API's `interactiveSubmissionPrepare` endpoint when preparing a
 * transaction for external signing. This provides insight into how much traffic (in bytes) the transaction will
 * consume and the estimated dollar cost.
 *
 * The returned estimate includes:
 * - Raw traffic costs (request, response, total)
 * - Total with ~5KB overhead for update confirmation
 * - Cost in cents and dollars (based on $60/MB pricing)
 *
 * @example
 *   ```typescript
 *   const prepared = await prepareExternalTransaction({
 *     ledgerClient,
 *     commands,
 *     userId,
 *     actAs,
 *     synchronizerId,
 *   });
 *
 *   const cost = getEstimatedTrafficCost(prepared);
 *   if (cost) {
 *     console.log(`Traffic: ${cost.totalCostWithOverhead} bytes`);
 *     console.log(`Cost: $${cost.costInDollars.toFixed(2)}`);
 *   }
 *   ```;
 *
 * @param preparedTransaction - The response from `interactiveSubmissionPrepare`.
 * @returns The traffic cost estimate, or `undefined` if cost estimation was not included.
 */
export function getEstimatedTrafficCost(
  preparedTransaction: InteractiveSubmissionPrepareResponse
): TrafficCostEstimate | undefined {
  const { costEstimation } = preparedTransaction;

  if (!costEstimation) {
    return undefined;
  }

  const totalCost = costEstimation.totalTrafficCostEstimation;
  const totalCostWithOverhead = totalCost + UPDATE_CONFIRMATION_OVERHEAD_BYTES;

  const result: TrafficCostEstimate = {
    requestCost: costEstimation.confirmationRequestTrafficCostEstimation,
    responseCost: costEstimation.confirmationResponseTrafficCostEstimation,
    totalCost,
    totalCostWithOverhead,
    costInCents: calculateTrafficCostInCents(totalCostWithOverhead),
    costInDollars: calculateTrafficCostInDollars(totalCostWithOverhead),
  };

  if (costEstimation.estimationTimestamp !== undefined) {
    result.estimatedAt = costEstimation.estimationTimestamp;
  }

  return result;
}
