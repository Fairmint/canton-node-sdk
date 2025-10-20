import { z } from 'zod';
import { type BaseClient, createApiOperation } from '../../../../../core';
import type { paths } from '../../../../../generated/canton/community/ledger/ledger-json-api/src/test/resources/json-api-docs/openapi';
import { type AllocatePartyResponse } from '../../../schemas/api';

// Type aliases for better readability and to avoid repetition
type GeneratedAllocatePartyRequest = paths['/v2/parties']['post']['requestBody']['content']['application/json'];

// Extended type to support both old and new API versions
type AllocatePartyRequest = GeneratedAllocatePartyRequest & {
  synchronizerId?: string;
  userId?: string;
};

// Schema for the parameters
export const AllocatePartyParamsSchema = z.object({
  /** Party ID hint (required) */
  partyIdHint: z.string(),
  /** Identity provider ID (required) */
  identityProviderId: z.string(),
  /** Synchronizer ID (required) */
  synchronizerId: z.string(),
  /** User ID (required) */
  userId: z.string(),
  /** Local metadata (optional) */
  localMetadata: z
    .object({
      resourceVersion: z.string().optional(),
      annotations: z.record(z.string(), z.string()).optional(),
    })
    .optional(),
});

export type AllocatePartyParams = z.infer<typeof AllocatePartyParamsSchema>;

/**
 * Allocate a new party to the participant node
 *
 * @example
 *   ```typescript
 *   const result = await client.allocateParty({
 *     partyIdHint: 'alice',
 *     identityProviderId: 'default',
 *     synchronizerId: 'global-synchronizer',
 *     userId: 'user-123'
 *   });
 *   ```;
 */
export const AllocateParty = createApiOperation<AllocatePartyParams, AllocatePartyResponse>({
  paramsSchema: AllocatePartyParamsSchema,
  method: 'POST',
  buildUrl: (_params: AllocatePartyParams, apiUrl: string) => `${apiUrl}/v2/parties`,
  buildRequestData: (params: AllocatePartyParams, _client: BaseClient): AllocatePartyRequest => ({
    partyIdHint: params.partyIdHint,
    identityProviderId: params.identityProviderId,
    synchronizerId: params.synchronizerId,
    userId: params.userId,
    ...(params.localMetadata && {
      localMetadata: {
        resourceVersion: params.localMetadata.resourceVersion ?? '',
        annotations: params.localMetadata.annotations ?? {},
      },
    }),
  }),
});
