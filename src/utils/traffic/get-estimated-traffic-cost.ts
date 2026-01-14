import { type InteractiveSubmissionPrepareResponse } from '../../clients/ledger-json-api/schemas/api/interactive-submission';
import { type TrafficCostEstimate } from './types';

/**
 * Extracts traffic cost estimation from a prepared transaction response.
 *
 * The cost estimation is returned by the Ledger JSON API's `interactiveSubmissionPrepare` endpoint when preparing a
 * transaction for external signing. This provides insight into how much traffic (in bytes) the transaction will
 * consume.
 *
 * @example
 *   ```typescript
 *   const prepared = await prepareExternalTransaction({
 *   ledgerClient,
 *   commands,
 *   userId,
 *   actAs,
 *   synchronizerId,
 *   });
 *
 *   const cost = getEstimatedTrafficCost(prepared);
 *   if (cost) {
 *   console.log(`Transaction will cost ~${cost.totalCost} bytes of traffic`);
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

  const result: TrafficCostEstimate = {
    requestCost: costEstimation.confirmationRequestTrafficCostEstimation,
    responseCost: costEstimation.confirmationResponseTrafficCostEstimation,
    totalCost: costEstimation.totalTrafficCostEstimation,
  };

  if (costEstimation.estimationTimestamp !== undefined) {
    result.estimatedAt = costEstimation.estimationTimestamp;
  }

  return result;
}
