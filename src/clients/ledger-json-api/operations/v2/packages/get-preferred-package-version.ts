import { createApiOperation } from '../../../../../core';
import { GetPreferredPackageVersionParamsSchema, GetPreferredPackageVersionParams } from '../../../schemas/operations';
import { GetPreferredPackageVersionResponse } from '../../../schemas/api';

/**
 * @description Get the preferred version of a specific package
 * @example
 * ```typescript
 * const preferredVersion = await client.getPreferredPackageVersion({
 *   packageName: 'MyPackage',
 *   parties: ['party1', 'party2'],
 *   synchronizerId: 'sync-123'
 * });
 * ```
 * @param packageName - Package name to get preferred version for
 * @param parties - Parties whose vetting state should be considered
 * @param synchronizerId - Optional synchronizer ID
 * @param vettingValidAt - Optional vetting valid at timestamp
 */
export const GetPreferredPackageVersion = createApiOperation<
  GetPreferredPackageVersionParams,
  GetPreferredPackageVersionResponse
>({
  paramsSchema: GetPreferredPackageVersionParamsSchema,
  method: 'POST',
  buildUrl: (_params: GetPreferredPackageVersionParams, apiUrl: string) => `${apiUrl}/v2/packages/preferred-package-version`,
  buildRequestData: (params: GetPreferredPackageVersionParams) => {
    const request = {
      packageVettingRequirements: [{
        parties: params.parties,
        packageName: params.packageName,
      }],
      synchronizerId: params.synchronizerId,
      vettingValidAt: params.vettingValidAt,
    };

    return request;
  },
}); 