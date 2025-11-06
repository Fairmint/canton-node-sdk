import { z } from 'zod';
import { createApiOperation } from '../../../../../core';
import { type operations } from '../../../../../generated/apps/validator/src/main/openapi/validator-internal';

/**
 * List all external party setup proposals
 *
 * @example
 *   ```typescript
 *   const result = await client.listExternalPartySetupProposals();
 *   console.log('Proposals:', result.contracts);
 *   ```;
 */
export const ListExternalPartySetupProposals = createApiOperation<
  void,
  operations['listExternalPartySetupProposals']['responses']['200']['content']['application/json']
>({
  paramsSchema: z.void(),
  method: 'GET',
  buildUrl: (_params, apiUrl: string) => `${apiUrl}/api/validator/v0/admin/external-party/setup-proposal`,
  buildRequestData: () => ({}),
});


