import { z } from 'zod';
import { createApiOperation, createRequestSchema } from '../../../../../core';
import { type operations } from '../../../../../generated/apps/validator/src/main/openapi/validator-internal';

type GenerateExternalPartyTopologyRequest =
  operations['generateExternalPartyTopology']['requestBody']['content']['application/json'];

/** Runtime schema kept in exact key/type parity with the generated topology request. */
export const GenerateExternalPartyTopologyParamsSchema = createRequestSchema<GenerateExternalPartyTopologyRequest>()({
  party_hint: z.string(),
  public_key: z.string(),
});

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
  GenerateExternalPartyTopologyRequest,
  operations['generateExternalPartyTopology']['responses']['200']['content']['application/json']
>({
  paramsSchema: GenerateExternalPartyTopologyParamsSchema,
  method: 'POST',
  buildUrl: (_params, apiUrl: string) => `${apiUrl}/api/validator/v0/admin/external-party/topology/generate`,
  buildRequestData: (params) => params,
});
