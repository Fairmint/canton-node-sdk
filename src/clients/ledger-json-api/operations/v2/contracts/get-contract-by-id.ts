import { createApiOperation } from '../../../../../core';
import {
  GetContractByIdRequestSchema,
  GetContractByIdResponseSchema,
  type GetContractByIdRequest,
  type GetContractByIdResponse,
} from '../../../schemas/api/contracts';

const endpoint = '/v2/contracts/contract-by-id' as const;

/** Parameters for looking up a contract by its contract ID. */
export type GetContractByIdParams = GetContractByIdRequest;

/**
 * Looks up current contract data by contract ID.
 *
 * This POST endpoint is a semantic read: callers may opt into the same read retry strategies as GET operations.
 */
export const GetContractById = createApiOperation<GetContractByIdParams, GetContractByIdResponse>({
  paramsSchema: GetContractByIdRequestSchema,
  responseSchema: GetContractByIdResponseSchema,
  method: 'POST',
  requestSemantics: 'read',
  buildUrl: (_params, apiUrl) => `${apiUrl}${endpoint}`,
  buildRequestData: (params) => params,
});
