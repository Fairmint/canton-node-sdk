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

type NullableWireOptionals<T> = {
  [Key in keyof T]: {} extends Pick<T, Key> ? Exclude<T[Key], undefined> | null : T[Key];
};

type RawTransactionSubtype = Omit<components['schemas']['TransactionSubtype'], 'amulet_operation' | 'interface_id'> & {
  amulet_operation?: string | null;
  interface_id?: string | null;
};

type RawValidatorWalletTransaction<Transaction extends ValidatorWalletTransaction = ValidatorWalletTransaction> =
  Transaction extends ValidatorWalletTransaction
    ? NullableWireOptionals<Omit<Transaction, 'transaction_subtype'>> & {
        transaction_subtype: RawTransactionSubtype;
      }
    : never;

type RawListTransactionsResponse = Omit<ListTransactionsResponse, 'items'> & {
  items: RawValidatorWalletTransaction[];
};

/** Runtime schema kept in exact key/type parity with the generated wallet transaction-history request. */
export const ListTransactionsParamsSchema = createRequestSchema<ListTransactionsParams>()({
  begin_after_id: z.string().optional(),
  // The handler converts this value to PageLimit, whose supported range is 1 through 1,000.
  page_size: z.number().int().min(1).max(MAX_PAGE_SIZE),
});

function normalizeTransactionSubtype(subtype: RawTransactionSubtype): components['schemas']['TransactionSubtype'] {
  const { amulet_operation, interface_id, ...requiredSubtype } = subtype;
  const transaction_subtype: components['schemas']['TransactionSubtype'] = requiredSubtype;

  if (amulet_operation != null) {
    transaction_subtype.amulet_operation = amulet_operation;
  }
  if (interface_id != null) {
    transaction_subtype.interface_id = interface_id;
  }

  return transaction_subtype;
}

function normalizeTransaction(item: RawValidatorWalletTransaction): ValidatorWalletTransaction {
  const transaction_subtype = normalizeTransactionSubtype(item.transaction_subtype);

  switch (item.transaction_type) {
    case 'transfer': {
      const {
        transaction_subtype: _rawSubtype,
        transfer_instruction_receiver,
        transfer_instruction_amount,
        transfer_instruction_cid,
        description,
        ...requiredTransaction
      } = item;
      const transaction: components['schemas']['TransferResponseItem'] = {
        ...requiredTransaction,
        transaction_subtype,
      };

      if (transfer_instruction_receiver != null) {
        transaction.transfer_instruction_receiver = transfer_instruction_receiver;
      }
      if (transfer_instruction_amount != null) {
        transaction.transfer_instruction_amount = transfer_instruction_amount;
      }
      if (transfer_instruction_cid != null) {
        transaction.transfer_instruction_cid = transfer_instruction_cid;
      }
      if (description != null) {
        transaction.description = description;
      }

      return transaction;
    }
    case 'balance_change': {
      const { transaction_subtype: _rawSubtype, transfer_instruction_cid, ...requiredTransaction } = item;
      const transaction: components['schemas']['BalanceChangeResponseItem'] = {
        ...requiredTransaction,
        transaction_subtype,
      };

      if (transfer_instruction_cid != null) {
        transaction.transfer_instruction_cid = transfer_instruction_cid;
      }

      return transaction;
    }
    case 'notification':
    case 'unknown':
      return { ...item, transaction_subtype };
    default: {
      const unsupportedTransaction: never = item;
      const discriminator = (unsupportedTransaction as unknown as { transaction_type?: unknown }).transaction_type;
      throw new Error(`Unsupported wallet transaction discriminator: ${String(discriminator)}`);
    }
  }
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
