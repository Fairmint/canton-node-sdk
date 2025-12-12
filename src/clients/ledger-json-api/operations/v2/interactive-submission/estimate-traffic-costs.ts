import { createApiOperation } from '../../../../../core';
import {
  InteractiveSubmissionEstimateTrafficCostsRequestSchema,
  type InteractiveSubmissionEstimateTrafficCostsRequest,
  type InteractiveSubmissionEstimateTrafficCostsResponse,
} from '../../../schemas/api/interactive-submission';

/**
 * Estimate the traffic costs of a prepared transaction before submitting it.
 *
 * Note: This endpoint is available on Canton nodes that expose interactive-submission
 * traffic estimation over the Ledger JSON API.
 */
export const InteractiveSubmissionEstimateTrafficCosts = createApiOperation<
  InteractiveSubmissionEstimateTrafficCostsRequest,
  InteractiveSubmissionEstimateTrafficCostsResponse
>({
  paramsSchema: InteractiveSubmissionEstimateTrafficCostsRequestSchema,
  method: 'POST',
  buildUrl: (_params: InteractiveSubmissionEstimateTrafficCostsRequest, apiUrl: string) =>
    `${apiUrl}/v2/interactive-submission/estimateTrafficCosts`,
  buildRequestData: (params: InteractiveSubmissionEstimateTrafficCostsRequest) => params,
});

