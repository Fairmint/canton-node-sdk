import { BaseClient, createApiOperation } from '../../../../../core';
import { z } from 'zod';
import type { paths } from '../../../../../generated/openapi-types';
import { AllocatePartyResponse } from '../../../schemas/api';

// Type aliases for better readability and to avoid repetition
type AllocatePartyRequest = paths['/v2/parties']['post']['requestBody']['content']['application/json'];

// Schema for the parameters  
export const AllocatePartyParamsSchema = z.object({
  /** Party ID hint (required) */
  partyIdHint: z.string(),
  /** Identity provider ID (required) */
  identityProviderId: z.string(),
  /** Local metadata (optional) */
  localMetadata: z.object({
    resourceVersion: z.string().optional(),
    annotations: z.record(z.string(), z.string()).optional(),
  }).optional(),
});

export type AllocatePartyParams = z.infer<typeof AllocatePartyParamsSchema>;

/**
 * @description Allocate a new party to the participant node
 * @example
 * ```typescript
 * const result = await client.allocateParty({
 *   partyIdHint: 'alice',
 *   identityProviderId: 'default'
 * });
 * console.log(`Allocated party: ${result.partyDetails.party}`);
 * ```
 */
export const AllocateParty = createApiOperation<
  AllocatePartyParams,
  AllocatePartyResponse
>({
  paramsSchema: AllocatePartyParamsSchema,
  method: 'POST',
  buildUrl: (_params: AllocatePartyParams, apiUrl: string) => `${apiUrl}/v2/parties`,
  buildRequestData: (params: AllocatePartyParams, _client: BaseClient): AllocatePartyRequest => {
    return {
      partyIdHint: params.partyIdHint ?? '',
      identityProviderId: params.identityProviderId ?? '',
      ...(params.localMetadata && {
        localMetadata: {
          resourceVersion: params.localMetadata.resourceVersion ?? '',
          annotations: params.localMetadata.annotations ?? {},
        },
      }),
    };
  },
}); 