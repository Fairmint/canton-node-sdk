import { z } from 'zod';
import { createApiOperation, createRequestSchema } from '../../../../../core';
import {
  type components,
  type operations,
} from '../../../../../generated/apps/wallet/src/main/openapi/wallet-internal';

const MAX_PAGE_SIZE = 1_000;

export type ListTransactionsParams = operations['listTransactions']['requestBody']['content']['application/json'];
export type ListTransactionsResponse =
  operations['listTransactions']['responses']['200']['content']['application/json'];
export type ValidatorWalletTransaction = components['schemas']['ListTransactionsResponseItem'];

/** Runtime schema kept in exact key/type parity with the generated wallet transaction-history request. */
export const ListTransactionsParamsSchema = createRequestSchema<ListTransactionsParams>()({
  begin_after_id: z.string().optional(),
  // The handler converts this value to PageLimit, whose supported range is 1 through 1,000.
  page_size: z.number().int().min(1).max(MAX_PAGE_SIZE),
});

/** List the authenticated wallet's transaction history, newest first. */
export const ListTransactions = createApiOperation<ListTransactionsParams, ListTransactionsResponse>({
  paramsSchema: ListTransactionsParamsSchema,
  method: 'POST',
  buildUrl: (_params, apiUrl: string): string => `${apiUrl}/api/validator/v0/wallet/transactions`,
  buildRequestData: (params): ListTransactionsParams => params,
});
