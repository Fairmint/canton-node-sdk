import { createApiOperation } from '../../../../../core';
import { z } from 'zod';
import { GetPackageStatusResponse } from '../../../schemas/api';

// Schema for the parameters
export const GetPackageStatusParamsSchema = z.object({
  /** Package ID to get status for */
  packageId: z.string(),
});

export type GetPackageStatusParams = z.infer<typeof GetPackageStatusParamsSchema>;

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