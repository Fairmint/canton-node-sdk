import { z } from 'zod';
import { createApiOperation } from '../../../../../core';
import { type operations } from '../../../../../generated/apps/validator/src/main/openapi/validator-internal';

const HEX_BYTES_PATTERN = /^(?:[0-9a-fA-F]{2})+$/;

type SubmitAcceptExternalPartySetupProposalRequest =
  operations['submitAcceptExternalPartySetupProposal']['requestBody']['content']['application/json'];
type SubmitAcceptExternalPartySetupProposalResponse =
  operations['submitAcceptExternalPartySetupProposal']['responses']['200']['content']['application/json'];

/** Submit an externally signed ExternalPartySetupProposal acceptance transaction. */
export const SubmitAcceptExternalPartySetupProposal = createApiOperation<
  SubmitAcceptExternalPartySetupProposalRequest,
  SubmitAcceptExternalPartySetupProposalResponse
>({
  paramsSchema: z.object({
    submission: z.object({
      party_id: z.string().min(1),
      transaction: z.string().min(1),
      signed_tx_hash: z.string().regex(HEX_BYTES_PATTERN),
      public_key: z.string().regex(HEX_BYTES_PATTERN),
    }),
  }) as z.ZodType<SubmitAcceptExternalPartySetupProposalRequest>,
  method: 'POST',
  buildUrl: (_params, apiUrl: string): string =>
    `${apiUrl}/api/validator/v0/admin/external-party/setup-proposal/submit-accept`,
  buildRequestData: (params): SubmitAcceptExternalPartySetupProposalRequest => params,
});
