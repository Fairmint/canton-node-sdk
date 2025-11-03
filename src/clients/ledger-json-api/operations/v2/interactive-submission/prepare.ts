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
  paths['/v2/interactive-submission/prepare']['post']['responses'][200]['content']['application/json'];

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
  buildRequestData: (params: InteractiveSubmissionPrepareRequest) =>
    params as unknown as GeneratedRequest,
  transformResponse: (response: GeneratedResponse): InteractiveSubmissionPrepareResponse => {
    const result: InteractiveSubmissionPrepareResponse = {
      preparedTransactionHash: response.preparedTransactionHash,
      hashingSchemeVersion: response.hashingSchemeVersion,
    };
    if (response.preparedTransaction !== undefined) {
      result.preparedTransaction = response.preparedTransaction;
    }
    if (response.submissionId !== undefined) {
      result.submissionId = response.submissionId;
    }
    if (response.verboseHashing !== undefined) {
      result.verboseHashing = response.verboseHashing;
    }
    return result;
  },
});
