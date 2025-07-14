import { createApiOperation } from '../../../../../core';
import { CompletionsParamsSchema, CompletionsParams } from '../../../schemas/operations';
import { CompletionStreamResponse } from '../../../schemas/api';

/**
 * @description Query completions list (blocking call)
 * @example
 * ```typescript
 * const completions = await client.completions({
 *   userId: 'user123',
 *   parties: ['party1', 'party2'],
 *   beginExclusive: 1000,
 *   limit: 50,
 *   streamIdleTimeoutMs: 30000
 * });
 * ```
 * @param userId - User ID to filter completions for
 * @param parties - Parties whose data should be included
 * @param beginExclusive - Beginning offset for completions (optional)
 * @param limit - Maximum number of elements to return (optional)
 * @param streamIdleTimeoutMs - Timeout for stream completion (optional)
 */
export const Completions = createApiOperation<
  CompletionsParams,
  CompletionStreamResponse[]
>({
  paramsSchema: CompletionsParamsSchema,
  method: 'POST',
  buildUrl: (params: CompletionsParams, apiUrl: string) => {
    const url = new URL(`${apiUrl}/v2/commands/completions`);
    
    if (params.limit !== undefined) {
      url.searchParams.set('limit', params.limit.toString());
    }
    
    if (params.streamIdleTimeoutMs !== undefined) {
      url.searchParams.set('stream_idle_timeout_ms', params.streamIdleTimeoutMs.toString());
    }
    
    return url.toString();
  },
  buildRequestData: (params: CompletionsParams) => {
    return {
      userId: params.userId,
      parties: params.parties,
      beginExclusive: params.beginExclusive,
    };
  },
}); 