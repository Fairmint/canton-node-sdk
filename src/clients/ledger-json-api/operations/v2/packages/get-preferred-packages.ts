import { createApiOperation } from '../../../../../core';
import { GetPreferredPackagesParamsSchema, GetPreferredPackagesParams } from '../../../schemas/operations';
import { GetPreferredPackagesRequest, GetPreferredPackagesResponse } from '../../../schemas/api';

/**
 * @description Get preferred packages based on vetting requirements
 * @example
 * ```typescript
 * const preferredPackages = await client.getPreferredPackages({
 *   packageVettingRequirements: [{
 *     parties: ['party1', 'party2'],
 *     packageName: 'MyPackage'
 *   }],
 *   synchronizerId: 'sync-123'
 * });
 * ```
 * @param packageVettingRequirements - Package vetting requirements
 * @param synchronizerId - Optional synchronizer ID
 * @param vettingValidAt - Optional vetting valid at timestamp
 */
export const GetPreferredPackages = createApiOperation<
  GetPreferredPackagesParams,
  GetPreferredPackagesResponse
>({
  paramsSchema: GetPreferredPackagesParamsSchema,
  method: 'POST',
  buildUrl: (_params: GetPreferredPackagesParams, apiUrl: string) => `${apiUrl}/v2/packages/preferred-packages`,
  buildRequestData: (params: GetPreferredPackagesParams) => {
    const request: GetPreferredPackagesRequest = {
      packageVettingRequirements: params.packageVettingRequirements,
      synchronizerId: params.synchronizerId,
      vettingValidAt: params.vettingValidAt,
    };

    return request;
  },
}); 