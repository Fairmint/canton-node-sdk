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
  buildRequestData: (params) => params,
});
