import { z } from 'zod';
import { createApiOperation } from '../../../../../core';
import { type operations } from '../../../../../generated/apps/validator/src/main/openapi/validator-internal';

/**
 * Generate external party topology transactions
 *
 * Creates topology transactions for an external party that need to be signed and then submitted via
 * submitExternalPartyTopology.
 *
 * @example
 *   ```typescript
 *   const topology = await client.generateExternalPartyTopology({
 *     party_hint: 'alice',
 *     public_key: 'hex-encoded-ed25519-public-key'
 *   });
 *   ```;
 */
export const GenerateExternalPartyTopology = createApiOperation<
  operations['generateExternalPartyTopology']['requestBody']['content']['application/json'],
  operations['generateExternalPartyTopology']['responses']['200']['content']['application/json']
>({
  paramsSchema: z.object({
    party_hint: z.string(),
    public_key: z.string(),
  }) as z.ZodType<operations['generateExternalPartyTopology']['requestBody']['content']['application/json']>,
  method: 'POST',
  buildUrl: (_params, apiUrl: string) => `${apiUrl}/api/validator/v0/admin/external-party/topology/generate`,
  buildRequestData: (params) => params,
});
