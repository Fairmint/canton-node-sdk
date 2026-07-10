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

type RawTransactionSubtype = Omit<components['schemas']['TransactionSubtype'], 'amulet_operation' | 'interface_id'> & {
  amulet_operation?: string | null;
  interface_id?: string | null;
};

type RawValidatorWalletTransaction = Omit<ValidatorWalletTransaction, 'transaction_subtype'> & {
  transaction_subtype: RawTransactionSubtype;
};

type RawListTransactionsResponse = Omit<ListTransactionsResponse, 'items'> & {
  items: RawValidatorWalletTransaction[];
};

/** Runtime schema kept in exact key/type parity with the generated wallet transaction-history request. */
export const ListTransactionsParamsSchema = createRequestSchema<ListTransactionsParams>()({
  begin_after_id: z.string().optional(),
  // The handler converts this value to PageLimit, whose supported range is 1 through 1,000.
  page_size: z.number().int().min(1).max(MAX_PAGE_SIZE),
});

function normalizeTransaction(item: RawValidatorWalletTransaction): ValidatorWalletTransaction {
  const { amulet_operation, interface_id, ...requiredSubtype } = item.transaction_subtype;
  const transaction_subtype: components['schemas']['TransactionSubtype'] = requiredSubtype;

  if (amulet_operation != null) {
    transaction_subtype.amulet_operation = amulet_operation;
  }
  if (interface_id != null) {
    transaction_subtype.interface_id = interface_id;
  }

  return { ...item, transaction_subtype } as ValidatorWalletTransaction;
}

function normalizeListTransactionsResponse(response: ListTransactionsResponse): ListTransactionsResponse {
  const raw = response as unknown as RawListTransactionsResponse;
  return { ...raw, items: raw.items.map(normalizeTransaction) };
}

/** List the authenticated wallet's transaction history, newest first. */
export const ListTransactions = createApiOperation<ListTransactionsParams, ListTransactionsResponse>({
  paramsSchema: ListTransactionsParamsSchema,
  method: 'POST',
  buildUrl: (_params, apiUrl: string): string => `${apiUrl}/api/validator/v0/wallet/transactions`,
  buildRequestData: (params): ListTransactionsParams => params,
  transformResponse: normalizeListTransactionsResponse,
});
