import { createApiOperation } from '../../../../../core';
import {
  InteractiveSubmissionExecuteAndWaitRequestSchema,
  InteractiveSubmissionExecuteAndWaitResponseSchema,
  type InteractiveSubmissionExecuteAndWaitRequest,
  type InteractiveSubmissionExecuteAndWaitResponse,
} from '../../../schemas/api/interactive-submission';
/** Execute an interactive submission and wait for its completion. */
export const InteractiveSubmissionExecuteAndWait = createApiOperation<
  InteractiveSubmissionExecuteAndWaitRequest,
  InteractiveSubmissionExecuteAndWaitResponse
>({
  paramsSchema: InteractiveSubmissionExecuteAndWaitRequestSchema,
  responseSchema: InteractiveSubmissionExecuteAndWaitResponseSchema,
  method: 'POST',
  buildUrl: (_params, apiUrl) => `${apiUrl}/v2/interactive-submission/executeAndWait`,
  buildRequestData: (params) => ({
    ...params,
    deduplicationPeriod: params.deduplicationPeriod ?? { Empty: {} },
  }),
  getFreshRetryIdentifier: (params) => params.submissionId,
});
