import { z } from 'zod';
import { createApiOperation } from '../../../../../../../../../core';
import { type paths } from '../../../../../../../../../generated/scan';

export const GetMemberTrafficStatus = createApiOperation<paths['/v0/domains/{domain_id}/members/{member_id}/traffic-status']['get']['parameters']['path'], paths['/v0/domains/{domain_id}/members/{member_id}/traffic-status']['get']['responses']['200']['content']['application/json']>({
  paramsSchema: z.object({
    domain_id: z.string(),
    member_id: z.string()
  }),
  method: 'GET',
  buildUrl: (params, apiUrl) => {
    const url = `${apiUrl}/v0/domains/${params.domain_id}/members/${params.member_id}/traffic-status`;
    return url;
  },
});
