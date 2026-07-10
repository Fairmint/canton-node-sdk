import { z } from 'zod';
import { createApiOperation, createRequestSchema } from '../../../../../core';
import { type operations } from '../../../../../generated/apps/validator/src/main/openapi/scan-proxy';

export type LookupTransferCommandCounterByPartyParams =
  operations['lookupTransferCommandCounterByParty']['parameters']['path'];
export type LookupTransferCommandCounterByPartyResponse =
  operations['lookupTransferCommandCounterByParty']['responses']['200']['content']['application/json'];

/** Runtime schema kept in exact key/type parity with the generated path parameters. */
export const LookupTransferCommandCounterByPartyParamsSchema =
  createRequestSchema<LookupTransferCommandCounterByPartyParams>()({
    party: z.string(),
  });

/**
 * Lookup transfer command counter by party
 *
 * @example
 *   ```typescript
 *   const counter = await client.lookupTransferCommandCounterByParty({ party: 'party123' });
 *
 *   ```;
 */
export const LookupTransferCommandCounterByParty = createApiOperation<
  LookupTransferCommandCounterByPartyParams,
  LookupTransferCommandCounterByPartyResponse
>({
  paramsSchema: LookupTransferCommandCounterByPartyParamsSchema,
  method: 'GET',
  buildUrl: (params, apiUrl: string): string =>
    `${apiUrl}/api/validator/v0/scan-proxy/transfer-command-counter/${encodeURIComponent(params.party)}`,
});
