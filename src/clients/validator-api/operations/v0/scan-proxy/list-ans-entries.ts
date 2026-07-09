import { z } from 'zod';
import { createApiOperation, createRequestSchema } from '../../../../../core';
import { type operations } from '../../../../../generated/apps/validator/src/main/openapi/scan-proxy';

export type ListAnsEntriesParams = operations['listAnsEntries']['parameters']['query'];
export type ListAnsEntriesResponse = operations['listAnsEntries']['responses']['200']['content']['application/json'];

/** Runtime schema kept in exact key/type parity with the generated query parameters. */
export const ListAnsEntriesParamsSchema = createRequestSchema<ListAnsEntriesParams>()({
  name_prefix: z.string().optional(),
  page_size: z.int32(),
});

/** List ANS entries through the validator's scan proxy. */
export const ListAnsEntries = createApiOperation<ListAnsEntriesParams, ListAnsEntriesResponse>({
  paramsSchema: ListAnsEntriesParamsSchema,
  method: 'GET',
  buildUrl: (params, apiUrl: string) => {
    const query = new URLSearchParams();
    if (params.name_prefix !== undefined) {
      query.set('name_prefix', params.name_prefix);
    }
    query.set('page_size', String(params.page_size));
    return `${apiUrl}/api/validator/v0/scan-proxy/ans-entries?${query.toString()}`;
  },
});
