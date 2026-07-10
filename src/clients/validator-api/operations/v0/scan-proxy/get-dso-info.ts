import { z } from 'zod';
import { createApiOperation } from '../../../../../core';
import { type operations } from '../../../../../generated/apps/validator/src/main/openapi/scan-proxy';

export type GetDsoInfoResponse = operations['getDsoInfo']['responses']['200']['content']['application/json'];

/** Get DSO information through the validator's scan proxy. */
export const GetDsoInfo = createApiOperation<void, GetDsoInfoResponse>({
  paramsSchema: z.void(),
  method: 'GET',
  buildUrl: (_params, apiUrl: string): string => `${apiUrl}/api/validator/v0/scan-proxy/dso`,
});
