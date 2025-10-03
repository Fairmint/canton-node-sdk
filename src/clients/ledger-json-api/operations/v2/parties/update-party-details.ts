import { type z } from 'zod';
import { createApiOperation } from '../../../../../core';
import type { paths } from '../../../../../generated/canton/community/ledger/ledger-json-api/src/test/resources/json-api-docs/openapi';
import { UpdatePartyDetailsParamsSchema } from '../../../schemas/operations';

type Endpoint = '/v2/parties/{party}';

// The params type should include both path parameters and request body
export type UpdatePartyDetailsParams = z.infer<typeof UpdatePartyDetailsParamsSchema>;

export type UpdatePartyDetailsResponse = paths[Endpoint]['patch']['responses']['200']['content']['application/json'];

export const UpdatePartyDetails = createApiOperation<UpdatePartyDetailsParams, UpdatePartyDetailsResponse>({
  paramsSchema: UpdatePartyDetailsParamsSchema,
  method: 'PATCH',
  buildUrl: (params, apiUrl) => `${apiUrl}/v2/parties/${params.party}`,
  buildRequestData: (params) => {
    const { party: _party, ...requestBody } = params;
    return requestBody;
  },
});
