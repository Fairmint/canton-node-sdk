import { z } from 'zod';
import { createApiOperation } from '../../../../../core';
import { type GetOpenAndIssuingMiningRoundsResponse } from '../../../schemas/api';

/**
 * Get open and issuing mining rounds
 *
 * @example
 *   ```typescript
 *   const rounds = await client.getOpenAndIssuingMiningRounds();
 *   
 *   ```
 */
export const GetOpenAndIssuingMiningRounds = createApiOperation<void, GetOpenAndIssuingMiningRoundsResponse>({
  paramsSchema: z.void(),
  method: 'GET',
  buildUrl: (_params: void, apiUrl: string) => `${apiUrl}/api/validator/v0/scan-proxy/open-and-issuing-mining-rounds`,
});
