import { z } from 'zod';
import { createApiOperation } from '../../../../../../../core';
import { type paths } from '../../../../../../../generated/scan';

export const ListDsoRulesVoteRequests = createApiOperation<void, paths['/v0/admin/sv/voterequests']['get']['responses']['200']['content']['application/json']>({
  paramsSchema: z.object({}),
  method: 'GET',
  buildUrl: (_params, apiUrl) => {
    const url = `${apiUrl}/v0/admin/sv/voterequests`;
    return url;
  },
});
