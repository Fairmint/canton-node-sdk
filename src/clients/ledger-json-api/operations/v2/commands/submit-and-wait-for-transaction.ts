import { type z } from 'zod';
import { createApiOperation } from '../../../../../core';
import type { paths } from '../../../../../generated/canton/community/ledger/ledger-json-api/src/test/resources/json-api-docs/openapi';
import { SubmitAndWaitForTransactionParamsSchema } from '../../../schemas/operations';
import { type TransactionFormat } from '../../../schemas/operations/updates';

const endpoint = '/v2/commands/submit-and-wait-for-transaction' as const;

export type SubmitAndWaitForTransactionParams = z.infer<typeof SubmitAndWaitForTransactionParamsSchema>;

export type SubmitAndWaitForTransactionResponse =
  paths[typeof endpoint]['post']['responses']['200']['content']['application/json'];

/**
 * The transaction format used when a caller does not pass one: every event visible to the submitting parties (`actAs` ∪
 * `readAs`), in `TRANSACTION_SHAPE_LEDGER_EFFECTS` so exercised events and their results are included, verbose, with
 * created-event blobs for disclosure.
 */
export function defaultSubmitTransactionFormat(parties: readonly string[]): TransactionFormat {
  return {
    eventFormat: {
      filtersByParty: Object.fromEntries(
        Array.from(new Set(parties)).map((party) => [
          party,
          {
            cumulative: [{ identifierFilter: { WildcardFilter: { value: { includeCreatedEventBlob: true } } } }],
          },
        ])
      ),
      verbose: true,
    },
    transactionShape: 'TRANSACTION_SHAPE_LEDGER_EFFECTS',
  };
}

/**
 * Submits commands and waits for the resulting transaction.
 *
 * Without an explicit `transactionFormat`, the response carries the full ledger effects (creates and exercises, with
 * exercise results) visible to `actAs` ∪ `readAs` — see {@link defaultSubmitTransactionFormat}.
 */
export const SubmitAndWaitForTransaction = createApiOperation<
  SubmitAndWaitForTransactionParams,
  SubmitAndWaitForTransactionResponse
>({
  paramsSchema: SubmitAndWaitForTransactionParamsSchema,
  method: 'POST',
  buildUrl: (_params, apiUrl) => `${apiUrl}${endpoint}`,
  buildRequestData: (params, client) => {
    const { transactionFormat, ...commands } = params;
    const actAs = params.actAs ?? [client.getPartyId()];
    return {
      commands: {
        ...commands,
        commandId:
          params.commandId ??
          `submit-and-wait-for-transaction-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
        actAs,
      },
      transactionFormat: transactionFormat ?? defaultSubmitTransactionFormat([...actAs, ...(params.readAs ?? [])]),
    };
  },
});
