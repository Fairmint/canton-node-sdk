import { z } from 'zod';
import { createRequestSchema } from '../../../../core';
import type { paths } from '../../../../generated/canton/community/ledger/ledger-json-api/src/test/resources/json-api-docs/openapi';
import { LedgerCreatedEventSchema, type LedgerCreatedEvent } from './created-event';

type ContractByIdEndpoint = '/v2/contracts/contract-by-id';

/** Exact request body for the pinned Ledger contract-by-id endpoint. */
export type GetContractByIdRequest = paths[ContractByIdEndpoint]['post']['requestBody']['content']['application/json'];

type GeneratedGetContractByIdResponse =
  paths[ContractByIdEndpoint]['post']['responses']['200']['content']['application/json'];

/** Exact contract-by-id response with Daml values narrowed from `unknown` to lossless JSON. */
export type GetContractByIdResponse = Omit<GeneratedGetContractByIdResponse, 'createdEvent'> & {
  createdEvent: LedgerCreatedEvent;
};

export const GetContractByIdRequestSchema = createRequestSchema<GetContractByIdRequest>()({
  contractId: z.string().min(1),
  queryingParties: z.array(z.string().min(1)).optional(),
});

export const GetContractByIdResponseSchema = createRequestSchema<GetContractByIdResponse>()({
  createdEvent: LedgerCreatedEventSchema,
});
