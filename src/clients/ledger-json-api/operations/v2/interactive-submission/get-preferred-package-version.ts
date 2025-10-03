import { createApiOperation } from '../../../../../core';
import { InteractiveSubmissionGetPreferredPackageVersionParamsSchema, type InteractiveSubmissionGetPreferredPackageVersionParams } from '../../../schemas/operations';
import { type GetPreferredPackageVersionResponse } from '../../../schemas/api';

/**
 * @description Get the preferred package version for constructing a command submission
 * @example
 * ```typescript
 * const result = await client.interactiveSubmissionGetPreferredPackageVersion({
 *   packageName: 'my-package',
 *   parties: ['Alice', 'Bob'],
 *   synchronizerId: 'sync-123'
 * });
 * console.log(`Preferred package: ${result.packagePreference?.packageReference.packageId}`);
 * ```
 */
export const InteractiveSubmissionGetPreferredPackageVersion = createApiOperation<
  InteractiveSubmissionGetPreferredPackageVersionParams,
  GetPreferredPackageVersionResponse
>({
  paramsSchema: InteractiveSubmissionGetPreferredPackageVersionParamsSchema,
  method: 'GET',
  buildUrl: (params: InteractiveSubmissionGetPreferredPackageVersionParams, apiUrl: string) => {
    const url = new URL(`${apiUrl}/v2/interactive-submission/preferred-package-version`);
    
    if (params.parties) {
      params.parties.forEach(party => url.searchParams.append('parties', party));
    }
    
    url.searchParams.append('package-name', params.packageName);
    
    if (params.vettingValidAt) {
      url.searchParams.append('vetting_valid_at', params.vettingValidAt);
    }
    
    if (params.synchronizerId) {
      url.searchParams.append('synchronizer-id', params.synchronizerId);
    }
    
    return url.toString();
  },
}); 