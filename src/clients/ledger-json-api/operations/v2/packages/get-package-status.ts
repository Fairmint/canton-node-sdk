import { createApiOperation } from '../../../../../core';
import { GetPackageStatusParamsSchema, GetPackageStatusParams } from '../../../schemas/operations';
import { GetPackageStatusResponse } from '../../../schemas/api';

/**
 * @description Get the status of a specific package
 * @example
 * ```typescript
 * const status = await client.getPackageStatus({
 *   packageId: 'package-123'
 * });
 * console.log(`Package status: ${status.packageStatus}`);
 * ```
 * @param packageId - Package ID to get status for
 */
export const GetPackageStatus = createApiOperation<
  GetPackageStatusParams,
  GetPackageStatusResponse
>({
  paramsSchema: GetPackageStatusParamsSchema,
  method: 'GET',
  buildUrl: (params: GetPackageStatusParams, apiUrl: string) => `${apiUrl}/v2/packages/${params.packageId}/status`,
}); 