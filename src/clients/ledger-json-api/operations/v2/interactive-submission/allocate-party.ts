import { createApiOperation } from '../../../../../core';
import { type InteractiveSubmissionAllocatePartyResponse } from '../../../schemas/api';
import {
  InteractiveSubmissionAllocatePartyParamsSchema,
  type InteractiveSubmissionAllocatePartyParams,
} from '../../../schemas/operations';

/**
 * Allocate party interactively
 *
 * @example
 *   ```typescript
 *   const result = await client.interactiveSubmissionAllocateParty({
 *   partyIdHint: 'Alice',
 *   displayName: 'Alice Party',
 *   isLocal: true
 *   });
 *
 *   ```;
 */
export const InteractiveSubmissionAllocateParty = createApiOperation<
  InteractiveSubmissionAllocatePartyParams,
  InteractiveSubmissionAllocatePartyResponse
>({
  paramsSchema: InteractiveSubmissionAllocatePartyParamsSchema,
  method: 'POST',
  buildUrl: (_params: InteractiveSubmissionAllocatePartyParams, apiUrl: string) =>
    `${apiUrl}/v2/interactive-submission/allocate-party`,
  buildRequestData: (params: InteractiveSubmissionAllocatePartyParams) => ({
    partyIdHint: params.partyIdHint,
    displayName: params.displayName,
    isLocal: params.isLocal,
  }),
});
