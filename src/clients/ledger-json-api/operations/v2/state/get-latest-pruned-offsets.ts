import { createApiOperation } from '../../../../../core';
import { type z } from 'zod';
import type { paths } from '../../../../../generated/canton/community/ledger/ledger-json-api/src/test/resources/json-api-docs/openapi';
import { GetLatestPrunedOffsetsParamsSchema } from '../../../schemas/operations';

const endpoint = '/v2/state/latest-pruned-offsets' as const;

export type GetLatestPrunedOffsetsParams = z.infer<typeof GetLatestPrunedOffsetsParamsSchema>;
export type GetLatestPrunedOffsetsResponse = paths[typeof endpoint]['get']['responses']['200']['content']['application/json'];

/**
 * @description Get latest pruned offsets
 * @example
 * ```typescript
 * const prunedOffsets = await client.getLatestPrunedOffsets();
 * console.log(`Participant pruned up to: ${prunedOffsets.participantPrunedUpToInclusive}`);
 * ```
 */
export const GetLatestPrunedOffsets = createApiOperation<GetLatestPrunedOffsetsParams, GetLatestPrunedOffsetsResponse>({
  paramsSchema: GetLatestPrunedOffsetsParamsSchema,
  method: 'GET',
  buildUrl: (_params, apiUrl) => `${apiUrl}${endpoint}`,
  buildRequestData: () => ({}),
}); 