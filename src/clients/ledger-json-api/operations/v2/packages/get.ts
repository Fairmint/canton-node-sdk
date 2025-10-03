import { createApiOperation } from '../../../../../core';
import { type ListPackagesResponse } from '../../../schemas/api';
import { z } from 'zod';

/**
 * @description List all packages available on the participant node
 * @example
 * ```typescript
 * const packages = await client.listPackages();
 * console.log(`Available packages: ${packages.packageIds.join(', ')}`);
 * ```
 */
export const ListPackages = createApiOperation<
  void,
  ListPackagesResponse
>({
  paramsSchema: z.void(),
  method: 'GET',
  buildUrl: (_params: void, apiUrl: string) => `${apiUrl}/v2/packages`,
}); 