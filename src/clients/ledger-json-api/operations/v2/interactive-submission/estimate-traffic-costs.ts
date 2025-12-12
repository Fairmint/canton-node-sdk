import { ApiOperation } from '../../../../../core';
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
export class InteractiveSubmissionEstimateTrafficCosts extends ApiOperation<
  InteractiveSubmissionEstimateTrafficCostsRequest,
  InteractiveSubmissionEstimateTrafficCostsResponse
> {
  public async execute(
    params: InteractiveSubmissionEstimateTrafficCostsRequest
  ): Promise<InteractiveSubmissionEstimateTrafficCostsResponse> {
    const validatedParams = this.validateParams(params, InteractiveSubmissionEstimateTrafficCostsRequestSchema);

    const apiUrl = this.getApiUrl();
    const candidates = [
      `${apiUrl}/v2/interactive-submission/estimateTrafficCosts`,
      `${apiUrl}/v2/interactive-submission/estimate-traffic-costs`,
      `${apiUrl}/v2/interactive-submission/estimateTrafficCost`,
      `${apiUrl}/v2/interactive-submission/estimate-traffic-cost`,
    ] as const;

    let lastError: unknown;
    for (const url of candidates) {
      try {
        return await this.makePostRequest<InteractiveSubmissionEstimateTrafficCostsResponse>(url, validatedParams, {
          contentType: 'application/json',
          includeBearerToken: true,
        });
      } catch (err) {
        // If the endpoint doesn't exist on this node, try the next spelling.
        // Any non-404 error should fail fast.
        if (err && typeof err === 'object' && 'statusCode' in err) {
          const { statusCode } = err as { statusCode?: number };
          if (statusCode !== 404) {
            throw err;
          }
        }
        lastError = err;
      }
    }

    throw lastError instanceof Error ? lastError : new Error('Traffic cost estimation failed for all known endpoints');
  }
}

