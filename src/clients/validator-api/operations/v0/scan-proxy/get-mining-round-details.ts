import { createApiOperation } from '../../../../../core';
import { type GetMiningRoundDetailsResponse } from '../../../schemas/api';
import { GetMiningRoundDetailsParamsSchema, type GetMiningRoundDetailsParams } from '../../../schemas/operations';

/**
 * Get details for a specific mining round
 *
 * @example
 *   ```typescript
 *   const details = await client.getMiningRoundDetails({ roundNumber: 1 });
 *   console.log(`Round status: ${details.mining_round.status}`);
 *   ```
 */
export const GetMiningRoundDetails = createApiOperation<GetMiningRoundDetailsParams, GetMiningRoundDetailsResponse>({
  paramsSchema: GetMiningRoundDetailsParamsSchema,
  method: 'GET',
  buildUrl: (params, apiUrl: string) => `${apiUrl}/api/validator/v0/scan-proxy/mining-rounds/${params.roundNumber}`,
});
