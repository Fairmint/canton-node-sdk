import { createApiOperation } from '../../../../../core';
import { ExternalPartyBalanceResponse } from '../../../schemas/api';
import { GetExternalPartyBalanceParamsSchema, GetExternalPartyBalanceParams } from '../../../schemas/operations';

/**
 * @description Get external party balance information
 * @example
 * ```typescript
 * const balance = await client.getExternalPartyBalance({ partyId: 'party123' });
 * console.log(`Total coin holdings: ${balance.total_coin_holdings}`);
 * ```
 */
export const GetExternalPartyBalance = createApiOperation<
  GetExternalPartyBalanceParams,
  ExternalPartyBalanceResponse
>({
  paramsSchema: GetExternalPartyBalanceParamsSchema,
  method: 'GET',
  buildUrl: (params, apiUrl: string) => `${apiUrl}/api/validator/v0/admin/parties/${params.partyId}/balance`,
}); 