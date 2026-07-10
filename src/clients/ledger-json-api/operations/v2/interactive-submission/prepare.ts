import { createApiOperation } from '../../../../../core';
import {
  InteractiveSubmissionPrepareRequestSchema,
  InteractiveSubmissionPrepareResponseSchema,
  type InteractiveSubmissionPrepareRequest,
  type InteractiveSubmissionPrepareResponse,
} from '../../../schemas/api/interactive-submission';

/** Prepare an interactive submission transaction for external signing. */
export const InteractiveSubmissionPrepare = createApiOperation<
  InteractiveSubmissionPrepareRequest,
  InteractiveSubmissionPrepareResponse
>({
  paramsSchema: InteractiveSubmissionPrepareRequestSchema,
  responseSchema: InteractiveSubmissionPrepareResponseSchema,
  method: 'POST',
  requestSemantics: 'read',
  buildUrl: (_params: InteractiveSubmissionPrepareRequest, apiUrl: string) =>
    `${apiUrl}/v2/interactive-submission/prepare`,
  // Canton models these OpenAPI-optional fields as non-defaulted Scala values at the JSON boundary.
  buildRequestData: (params) => ({
    ...params,
    synchronizerId: params.synchronizerId ?? '',
    packageIdSelectionPreference: params.packageIdSelectionPreference ?? [],
    ...(params.estimateTrafficCost === undefined
      ? {}
      : {
          estimateTrafficCost: {
            ...params.estimateTrafficCost,
            expectedSignatures: params.estimateTrafficCost.expectedSignatures ?? [],
          },
        }),
  }),
});
