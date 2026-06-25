import { z } from 'zod';
import { createApiOperation } from '../../../../../core';
import { type operations } from '../../../../../generated/apps/validator/src/main/openapi/validator-internal';

type PrepareAcceptExternalPartySetupProposalRequest =
  operations['prepareAcceptExternalPartySetupProposal']['requestBody']['content']['application/json'];
type PrepareAcceptExternalPartySetupProposalResponse =
  operations['prepareAcceptExternalPartySetupProposal']['responses']['200']['content']['application/json'];

/** Prepare an externally signed ExternalPartySetupProposal acceptance transaction. */
export const PrepareAcceptExternalPartySetupProposal = createApiOperation<
  PrepareAcceptExternalPartySetupProposalRequest,
  PrepareAcceptExternalPartySetupProposalResponse
>({
  paramsSchema: z.object({
    contract_id: z.string().min(1),
    user_party_id: z.string().min(1),
    verbose_hashing: z.boolean().default(false),
  }) as z.ZodType<PrepareAcceptExternalPartySetupProposalRequest>,
  method: 'POST',
  buildUrl: (_params, apiUrl: string): string =>
    `${apiUrl}/api/validator/v0/admin/external-party/setup-proposal/prepare-accept`,
  buildRequestData: (params): PrepareAcceptExternalPartySetupProposalRequest => params,
});
