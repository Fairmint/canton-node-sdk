/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from 'zod';
import { createApiOperation } from '../../../../../../../../../core';
import { type paths } from '../../../../../../../../../generated/scan';

export interface GetPartyToParticipantParams {
  domain_id: string;
  party_id: string;
}

export const GetPartyToParticipant = createApiOperation<GetPartyToParticipantParams, paths['/v0/domains/{domain_id}/parties/{party_id}/participant-id']['get']['responses']['200']['content']['application/json']>({
  paramsSchema: z.any(),
  method: 'GET',
  buildUrl: (params, apiUrl) => {
    const url = `${apiUrl}/v0/domains/${params.domain_id}/parties/${params.party_id}/participant-id`;
    return url;
  },
});
