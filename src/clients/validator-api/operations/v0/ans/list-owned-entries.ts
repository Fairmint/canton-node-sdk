import { z } from 'zod';
import { createApiOperation } from '../../../../../core';
import { type operations } from '../../../../../generated/apps/validator/src/main/openapi/ans-external';

export type ListOwnedAnsEntriesResponse =
  operations['listAnsEntries']['responses']['200']['content']['application/json'];

/** List ANS entries owned by the authenticated validator user. */
export const ListOwnedAnsEntries = createApiOperation<void, ListOwnedAnsEntriesResponse>({
  paramsSchema: z.void(),
  method: 'GET',
  buildUrl: (_params: void, apiUrl: string) => `${apiUrl}/api/validator/v0/entry/all`,
});
