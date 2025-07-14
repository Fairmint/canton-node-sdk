import { createApiOperation } from '../../../../../core';
import { GetLedgerEndParamsSchema, GetLedgerEndParams } from '../../../schemas/operations';
import { GetLedgerEndResponse } from '../../../schemas/api';

/**
 * @description Get ledger end offset
 * @example
 * ```typescript
 * const ledgerEnd = await client.getLedgerEnd();
 * console.log(`Ledger end offset: ${ledgerEnd.offset}`);
 * ```
 */
export const GetLedgerEnd = createApiOperation<
  GetLedgerEndParams,
  GetLedgerEndResponse
>({
  paramsSchema: GetLedgerEndParamsSchema,
  method: 'GET',
  buildUrl: (_params: GetLedgerEndParams, apiUrl: string) => `${apiUrl}/v2/state/ledger-end`,
}); 