import { createApiOperation } from '../../../../../core';
import {
  createGetContractByIdResponseSchema,
  GetContractByIdRequestSchema,
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
 *
 * The pinned service synthesizes event metadata that has no ledger-event meaning. The SDK removes `offset`, `nodeId`,
 * `createdEventBlob`, `interfaceViews`, and `acsDelta` from the public response, then binds the remaining contract and
 * witness data to the successful request attempt. This endpoint must not be used for contracts imported through party
 * replication or repair.
 */
export const GetContractById = createApiOperation<GetContractByIdParams, GetContractByIdResponse>({
  paramsSchema: GetContractByIdRequestSchema,
  responseSchema: createGetContractByIdResponseSchema,
  method: 'POST',
  requestSemantics: 'read',
  buildUrl: (_params, apiUrl) => `${apiUrl}${endpoint}`,
  buildRequestData: (params) => params,
});
