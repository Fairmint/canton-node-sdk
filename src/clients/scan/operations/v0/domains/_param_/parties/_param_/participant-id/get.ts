import { z } from 'zod';
import { createApiOperation } from '../../../../../../../../../core';
import { type paths } from '../../../../../../../../../generated/scan';

export const GetPartyToParticipant = createApiOperation<paths['/v0/domains/{domain_id}/parties/{party_id}/participant-id']['get']['parameters']['path'], paths['/v0/domains/{domain_id}/parties/{party_id}/participant-id']['get']['responses']['200']['content']['application/json']>({
  paramsSchema: z.object({
    domain_id: z.string(),
    party_id: z.string()
  }),
  method: 'GET',
  buildUrl: (params, apiUrl) => {
    const url = `${apiUrl}/v0/domains/${params.domain_id}/parties/${params.party_id}/participant-id`;
    return url;
  },
});
