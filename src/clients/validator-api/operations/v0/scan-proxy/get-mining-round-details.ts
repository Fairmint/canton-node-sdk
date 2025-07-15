import { createApiOperation } from '../../../../../core';
import { GetMiningRoundDetailsResponse } from '../../../schemas/api';
import { GetMiningRoundDetailsParamsSchema } from '../../../schemas/operations';

/**
 * @description Get details for a specific mining round
 * @example
 * ```typescript
 * const details = await client.getMiningRoundDetails({ roundNumber: 1 });
 * console.log(`Round status: ${details.mining_round.status}`);
 * ```
 */
export const GetMiningRoundDetails = createApiOperation<
  typeof GetMiningRoundDetailsParamsSchema._type,
  GetMiningRoundDetailsResponse
>({
  paramsSchema: GetMiningRoundDetailsParamsSchema,
  method: 'GET',
  buildUrl: (params, apiUrl: string) => `${apiUrl}/api/validator/v0/scan-proxy/mining-rounds/${params.roundNumber}`,
}); 