import { type z } from 'zod';
import { createApiOperation } from '../../../../../core';
import { ApiError } from '../../../../../core/errors';
import type { paths } from '../../../../../generated/canton/community/ledger/ledger-json-api/src/test/resources/json-api-docs/openapi';
import { SubmitAndWaitForTransactionTreeParamsSchema } from '../../../schemas/operations';

const endpoint = '/v2/commands/submit-and-wait-for-transaction-tree' as const;

export type SubmitAndWaitForTransactionTreeParams = z.infer<typeof SubmitAndWaitForTransactionTreeParamsSchema>;

type GeneratedResponse = paths[typeof endpoint]['post']['responses']['200']['content']['application/json'];

export type SubmitAndWaitForTransactionTreeResponse = GeneratedResponse & {
  readonly transactionTree: NonNullable<GeneratedResponse['transactionTree']>;
};

export const SubmitAndWaitForTransactionTree = createApiOperation<
  SubmitAndWaitForTransactionTreeParams,
  SubmitAndWaitForTransactionTreeResponse
>({
  paramsSchema: SubmitAndWaitForTransactionTreeParamsSchema,
  method: 'POST',
  buildUrl: (_params, apiUrl) => `${apiUrl}${endpoint}`,
  buildRequestData: (params, client) => ({
    ...params,
    commandId:
      params.commandId ??
      `submit-and-wait-for-transaction-tree-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
    actAs: params.actAs ?? [client.getPartyId()],
  }),
  transformResponse: (response): SubmitAndWaitForTransactionTreeResponse => {
    const generatedResponse = response as unknown as { readonly transactionTree?: unknown };
    if (generatedResponse.transactionTree === undefined || generatedResponse.transactionTree === null) {
      throw new ApiError('Submit-and-wait-for-transaction-tree response did not include a transaction tree');
    }
    return response;
  },
});
