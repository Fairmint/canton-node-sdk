import { z } from 'zod';
import { createApiOperation } from '../../../../core';

const publicRequestConfig = { contentType: 'application/json', includeBearerToken: false } as const;

/**
 * Checks whether the validator API is ready to serve traffic
 *
 * @example
 *   ```typescript
 *   await client.isReady();
 *
 *   ```;
 */
export const IsReady = createApiOperation<void, void>({
  paramsSchema: z.void(),
  method: 'GET',
  buildUrl: (_params: void, apiUrl: string): string => `${apiUrl}/api/validator/readyz`,
  requestConfig: publicRequestConfig,
});

/**
 * Checks whether the validator API process is live
 *
 * @example
 *   ```typescript
 *   await client.isLive();
 *
 *   ```;
 */
export const IsLive = createApiOperation<void, void>({
  paramsSchema: z.void(),
  method: 'GET',
  buildUrl: (_params: void, apiUrl: string): string => `${apiUrl}/api/validator/livez`,
  requestConfig: publicRequestConfig,
});
