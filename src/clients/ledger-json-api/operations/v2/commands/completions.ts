import { z } from 'zod';
import { createApiOperation } from '../../../../../core';
import type { paths } from '../../../../../generated/canton/community/ledger/ledger-json-api/src/test/resources/json-api-docs/openapi';

const endpoint = '/v2/commands/completions';

export const CompletionsParamsSchema = z.object({
  userId: z.string(),
  parties: z.array(z.string()),
  beginExclusive: z.number(),
  limit: z.number().optional(),
  streamIdleTimeoutMs: z.number().optional(),
});

export type CompletionsParams = z.infer<typeof CompletionsParamsSchema>;
export type CompletionsRequest = paths[typeof endpoint]['post']['requestBody']['content']['application/json'];
export type CompletionsResponse = paths[typeof endpoint]['post']['responses']['200']['content']['application/json'];

export const Completions = createApiOperation<CompletionsParams, CompletionsResponse>({
  paramsSchema: CompletionsParamsSchema,
  method: 'POST',
  buildUrl: (params, apiUrl) => {
    const url = new URL(`${apiUrl}${endpoint}`);
    if (params.limit !== undefined) {
      url.searchParams.set('limit', params.limit.toString());
    }
    if (params.streamIdleTimeoutMs !== undefined) {
      url.searchParams.set('stream_idle_timeout_ms', params.streamIdleTimeoutMs.toString());
    }
    return url.toString();
  },
  buildRequestData: (params): CompletionsRequest => ({
    userId: params.userId,
    parties: params.parties,
    beginExclusive: params.beginExclusive,
  }),
});
