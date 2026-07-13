import { createApiOperation } from '../../../../../core';
import {
  InteractiveSubmissionExecuteRequestSchema,
  InteractiveSubmissionExecuteResponseSchema,
  type InteractiveSubmissionExecuteRequest,
  type InteractiveSubmissionExecuteResponse,
} from '../../../schemas/api/interactive-submission';
/** Execute an interactive submission that has been previously prepared and signed. */
export const InteractiveSubmissionExecute = createApiOperation<
  InteractiveSubmissionExecuteRequest,
  InteractiveSubmissionExecuteResponse
>({
  paramsSchema: InteractiveSubmissionExecuteRequestSchema,
  responseSchema: InteractiveSubmissionExecuteResponseSchema,
  method: 'POST',
  buildUrl: (_params: InteractiveSubmissionExecuteRequest, apiUrl: string) =>
    `${apiUrl}/v2/interactive-submission/execute`,
  buildRequestData: (params) => ({
    ...params,
    deduplicationPeriod: params.deduplicationPeriod ?? { Empty: {} },
  }),
  getFreshRetryIdentifier: (params) => params.submissionId,
});
