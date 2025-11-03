import { createApiOperation } from '../../../../../core';
import type { paths } from '../../../../../generated/canton/community/ledger/ledger-json-api/src/test/resources/json-api-docs/openapi';
import {
  InteractiveSubmissionExecuteRequestSchema,
  type InteractiveSubmissionExecuteRequest,
  type InteractiveSubmissionExecuteResponse,
} from '../../../schemas/api/interactive-submission';

type GeneratedRequest =
  paths['/v2/interactive-submission/execute']['post']['requestBody']['content']['application/json'];

type GeneratedResponse =
  paths['/v2/interactive-submission/execute']['post']['responses'][200]['content']['application/json'];

/**
 * Execute an interactive submission that has been previously prepared and signed.
 */
export const InteractiveSubmissionExecute = createApiOperation<
  InteractiveSubmissionExecuteRequest,
  InteractiveSubmissionExecuteResponse
>({
  paramsSchema: InteractiveSubmissionExecuteRequestSchema,
  method: 'POST',
  buildUrl: (_params: InteractiveSubmissionExecuteRequest, apiUrl: string) =>
    `${apiUrl}/v2/interactive-submission/execute`,
  buildRequestData: (params: InteractiveSubmissionExecuteRequest) =>
    params as unknown as GeneratedRequest,
  transformResponse: (_response: GeneratedResponse): InteractiveSubmissionExecuteResponse => ({}),
});
