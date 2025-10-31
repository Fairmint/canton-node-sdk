import { createApiOperation } from '../../../../../core';
import type { paths } from '../../../../../generated/canton/community/ledger/ledger-json-api/src/test/resources/json-api-docs/openapi';
import {
  InteractiveSubmissionPrepareRequestSchema,
  type InteractiveSubmissionPrepareRequest,
  type InteractiveSubmissionPrepareResponse,
} from '../../../schemas/api/interactive-submission';

type GeneratedRequest =
  paths['/v2/interactive-submission/prepare']['post']['requestBody']['content']['application/json'];
type GeneratedResponse =
  paths['/v2/interactive-submission/prepare']['post']['responses']['200']['content']['application/json'];

/**
 * Prepare an interactive submission transaction for external signing.
 */
export const InteractiveSubmissionPrepare = createApiOperation<
  InteractiveSubmissionPrepareRequest,
  InteractiveSubmissionPrepareResponse
>({
  paramsSchema: InteractiveSubmissionPrepareRequestSchema,
  method: 'POST',
  buildUrl: (_params: InteractiveSubmissionPrepareRequest, apiUrl: string) =>
    `${apiUrl}/v2/interactive-submission/prepare`,
  buildRequestData: (params: InteractiveSubmissionPrepareRequest): GeneratedRequest => ({
    ...params,
  }),
  transformResponse: (response: GeneratedResponse): InteractiveSubmissionPrepareResponse => ({
    preparedTransactionHash: response.preparedTransactionHash,
    preparedTransaction: response.preparedTransaction,
    submissionId: response.submissionId,
    hashingSchemeVersion: response.hashingSchemeVersion,
    verboseHashing: response.verboseHashing,
  }),
});
