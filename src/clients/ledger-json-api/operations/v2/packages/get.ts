import { createApiOperation } from '../../../../../core';
import { ListPackagesParamsSchema, ListPackagesParams } from '../../../schemas/operations';
import { ListPackagesResponse } from '../../../schemas/api';

/**
 * @description List all packages available on the participant node
 * @example
 * ```typescript
 * const packages = await client.listPackages();
 * console.log(`Available packages: ${packages.packageIds.join(', ')}`);
 * ```
 */
export const ListPackages = createApiOperation<
  ListPackagesParams,
  ListPackagesResponse
>({
  paramsSchema: ListPackagesParamsSchema,
  method: 'GET',
  buildUrl: (_params: ListPackagesParams, apiUrl: string) => `${apiUrl}/v2/packages`,
}); 