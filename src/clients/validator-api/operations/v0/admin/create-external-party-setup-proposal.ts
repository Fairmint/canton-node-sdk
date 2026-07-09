import { z } from 'zod';
import { createApiOperation, createRequestSchema } from '../../../../../core';
import { type operations } from '../../../../../generated/apps/validator/src/main/openapi/validator-internal';

type CreateExternalPartySetupProposalRequest =
  operations['createExternalPartySetupProposal']['requestBody']['content']['application/json'];

/** Runtime schema kept in exact key/type parity with the generated setup-proposal request. */
export const CreateExternalPartySetupProposalParamsSchema =
  createRequestSchema<CreateExternalPartySetupProposalRequest>()({
    user_party_id: z.string().min(1),
  });

/** Create an ExternalPartySetupProposal contract for an external party. */
export const CreateExternalPartySetupProposal = createApiOperation<
  CreateExternalPartySetupProposalRequest,
  operations['createExternalPartySetupProposal']['responses']['200']['content']['application/json']
>({
  paramsSchema: CreateExternalPartySetupProposalParamsSchema,
  method: 'POST',
  buildUrl: (_params, apiUrl: string) => `${apiUrl}/api/validator/v0/admin/external-party/setup-proposal`,
  buildRequestData: (params) => params,
});
