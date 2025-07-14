import { createApiOperation } from '../../../../../core';
import { GetLatestPrunedOffsetsParamsSchema, GetLatestPrunedOffsetsParams } from '../../../schemas/operations';
import { GetLatestPrunedOffsetsResponse } from '../../../schemas/api';

/**
 * @description Get latest pruned offsets
 * @example
 * ```typescript
 * const prunedOffsets = await client.getLatestPrunedOffsets();
 * console.log(`Participant pruned up to: ${prunedOffsets.participantPrunedUpToInclusive}`);
 * ```
 */
export const GetLatestPrunedOffsets = createApiOperation<
  GetLatestPrunedOffsetsParams,
  GetLatestPrunedOffsetsResponse
>({
  paramsSchema: GetLatestPrunedOffsetsParamsSchema,
  method: 'GET',
  buildUrl: (_params: GetLatestPrunedOffsetsParams, apiUrl: string) => `${apiUrl}/v2/state/latest-pruned-offsets`,
}); 