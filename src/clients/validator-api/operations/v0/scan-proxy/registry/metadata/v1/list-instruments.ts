import { createApiOperation } from '../../../../../../../../core';
import { z } from 'zod';
import type { paths } from '../../../../../../../../generated/token-standard/splice-api-token-metadata-v1/openapi/token-metadata-v1';

const apiPath = '/registry/metadata/v1/instruments';
const endpoint = '/api/validator/v0/scan-proxy/registry/metadata/v1/instruments';

export const ListInstrumentsParamsSchema = z.object({
  pageSize: z.number().optional(),
  pageToken: z.string().optional(),
});

export type ListInstrumentsParams = z.infer<typeof ListInstrumentsParamsSchema>;
export type ListInstrumentsResponse = paths[typeof apiPath]['get']['responses']['200']['content']['application/json'];

/**
 * @description List all instruments managed by this instrument admin
 * @example
 * ```typescript
 * const instruments = await client.listInstruments({
 *   pageSize: 25,
 *   pageToken: 'next-page-token'
 * });
 * console.log(`Found ${instruments.instruments.length} instruments`);
 * ```
 */
export const ListInstruments = createApiOperation<
  ListInstrumentsParams,
  ListInstrumentsResponse
>({
  paramsSchema: ListInstrumentsParamsSchema,
  method: 'GET',
  buildUrl: (params: ListInstrumentsParams, apiUrl: string) => {
    const url = new URL(`${apiUrl}${endpoint}`);
    if (params.pageSize !== undefined) {
      url.searchParams.set('pageSize', params.pageSize.toString());
    }
    if (params.pageToken !== undefined) {
      url.searchParams.set('pageToken', params.pageToken);
    }
    return url.toString();
  },
}); 