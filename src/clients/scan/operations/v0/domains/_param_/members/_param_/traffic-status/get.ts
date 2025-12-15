/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from 'zod';
import { createApiOperation } from '../../../../../../../../../core';
import { type paths } from '../../../../../../../../../generated/scan';

export interface GetMemberTrafficStatusParams {
  domain_id: string;
  member_id: string;
}

export const GetMemberTrafficStatus = createApiOperation<GetMemberTrafficStatusParams, paths['/v0/domains/{domain_id}/members/{member_id}/traffic-status']['get']['responses']['200']['content']['application/json']>({
  paramsSchema: z.any(),
  method: 'GET',
  buildUrl: (params, apiUrl) => {
    const url = `${apiUrl}/v0/domains/${params.domain_id}/members/${params.member_id}/traffic-status`;
    return url;
  },
});
