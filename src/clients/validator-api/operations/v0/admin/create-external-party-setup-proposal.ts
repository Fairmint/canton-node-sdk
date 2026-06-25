import { z } from 'zod';
import { createApiOperation } from '../../../../../core';
import { type operations } from '../../../../../generated/apps/validator/src/main/openapi/validator-internal';

/** Create an ExternalPartySetupProposal contract for an external party. */
export const CreateExternalPartySetupProposal = createApiOperation<
  operations['createExternalPartySetupProposal']['requestBody']['content']['application/json'],
  operations['createExternalPartySetupProposal']['responses']['200']['content']['application/json']
>({
  paramsSchema: z.object({
    user_party_id: z.string().min(1),
  }) as z.ZodType<operations['createExternalPartySetupProposal']['requestBody']['content']['application/json']>,
  method: 'POST',
  buildUrl: (_params, apiUrl: string) => `${apiUrl}/api/validator/v0/admin/external-party/setup-proposal`,
  buildRequestData: (params) => params,
});
