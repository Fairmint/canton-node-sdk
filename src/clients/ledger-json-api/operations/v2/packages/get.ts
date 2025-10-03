import { z } from 'zod';
import { createApiOperation } from '../../../../../core';
import { type ListPackagesResponse } from '../../../schemas/api';

/**
 * List all packages available on the participant node
 *
 * @example
 *   ```typescript
 *   const packages = await client.listPackages();
 *
 *   ```;
 */
export const ListPackages = createApiOperation<void, ListPackagesResponse>({
  paramsSchema: z.void(),
  method: 'GET',
  buildUrl: (_params: void, apiUrl: string) => `${apiUrl}/v2/packages`,
});
