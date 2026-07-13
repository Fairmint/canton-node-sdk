import { createApiOperation } from '../../../../../core';
import {
  InteractiveSubmissionExecuteAndWaitForTransactionRequestSchema,
  InteractiveSubmissionExecuteAndWaitForTransactionResponseSchema,
  type InteractiveSubmissionExecuteAndWaitForTransactionRequest,
  type InteractiveSubmissionExecuteAndWaitForTransactionResponse,
} from '../../../schemas/api/interactive-submission';
/** Execute an interactive submission and wait for the resulting transaction. */
export const InteractiveSubmissionExecuteAndWaitForTransaction = createApiOperation<
  InteractiveSubmissionExecuteAndWaitForTransactionRequest,
  InteractiveSubmissionExecuteAndWaitForTransactionResponse
>({
  paramsSchema: InteractiveSubmissionExecuteAndWaitForTransactionRequestSchema,
  responseSchema: InteractiveSubmissionExecuteAndWaitForTransactionResponseSchema,
  method: 'POST',
  buildUrl: (_params, apiUrl) => `${apiUrl}/v2/interactive-submission/executeAndWaitForTransaction`,
  buildRequestData: (params) => ({
    ...params,
    deduplicationPeriod: params.deduplicationPeriod ?? { Empty: {} },
  }),
  getFreshRetryIdentifier: (params) => params.submissionId,
});
