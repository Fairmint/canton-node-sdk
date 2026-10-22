import { type z } from 'zod';
import { createApiOperation } from '../../../../../core';
import type { paths } from '../../../../../generated/canton/community/ledger/ledger-json-api/src/test/resources/json-api-docs/openapi';
import { GetUpdateByOffsetParamsSchema } from '../../../schemas/operations';

const endpoint = '/v2/updates/update-by-offset' as const;

export type GetUpdateByOffsetParams = z.infer<typeof GetUpdateByOffsetParamsSchema>;
export type GetUpdateByOffsetResponse =
  paths[typeof endpoint]['post']['responses']['200']['content']['application/json'];

/**
 * Fetches the update at one offset, formatted by the caller's `updateFormat`.
 *
 * Build `updateFormat` with `buildUpdateFormat` for template or interface filters, with or without created event blobs
 * and interface views, and for either transaction shape.
 *
 * @example
 *   ```typescript
 *   const update = await client.getUpdateByOffset({
 *     offset: 1000,
 *     updateFormat: buildUpdateFormat({
 *       parties: ['party1'],
 *       interfaceIds: ['#OpenCapTableApi-v01:Fairmint.OpenCapTableApi.OcfObject:OcfObject'],
 *     }),
 *   });
 *   ```;
 */
export const GetUpdateByOffset = createApiOperation<GetUpdateByOffsetParams, GetUpdateByOffsetResponse>({
  paramsSchema: GetUpdateByOffsetParamsSchema,
  method: 'POST',
  requestSemantics: 'read',
  buildUrl: (_params, apiUrl) => `${apiUrl}${endpoint}`,
  buildRequestData: (params) => params,
});
