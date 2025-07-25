import { createApiOperation } from '../../../../../core';
import { z } from 'zod';
import type { paths } from '../../../../../generated/canton/community/ledger/ledger-json-api/src/test/resources/json-api-docs/openapi';

const endpoint = '/v2/state/latest-pruned-offsets' as const;

export type GetLatestPrunedOffsetsParams = paths[typeof endpoint]['get']['parameters']['query'];
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
  paramsSchema: z.any(),
  method: 'GET',
  buildUrl: (_params, apiUrl) => `${apiUrl}${endpoint}`,
  buildRequestData: () => ({}),
}); 