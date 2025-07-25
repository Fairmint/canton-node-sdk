import { createApiOperation } from '../../../../../core';
import { InteractiveSubmissionGetPreferredPackagesParamsSchema, InteractiveSubmissionGetPreferredPackagesParams } from '../../../schemas/operations';
import { GetPreferredPackagesResponse } from '../../../schemas/api';

/**
 * @description Get the version of preferred packages for constructing a command submission
 * @example
 * ```typescript
 * const result = await client.interactiveSubmissionGetPreferredPackages({
 *   packageVettingRequirements: [
 *     {
 *       parties: ['Alice', 'Bob'],
 *       packageName: 'my-package'
 *     }
 *   ],
 *   synchronizerId: 'sync-123'
 * });
 * console.log(`Preferred packages: ${result.packageReferences.map(p => p.packageId).join(', ')}`);
 * ```
 */
export const InteractiveSubmissionGetPreferredPackages = createApiOperation<
  InteractiveSubmissionGetPreferredPackagesParams,
  GetPreferredPackagesResponse
>({
  paramsSchema: InteractiveSubmissionGetPreferredPackagesParamsSchema,
  method: 'POST',
  buildUrl: (_params: InteractiveSubmissionGetPreferredPackagesParams, apiUrl: string) => `${apiUrl}/v2/interactive-submission/preferred-packages`,
  buildRequestData: (params: InteractiveSubmissionGetPreferredPackagesParams) => ({
    packageVettingRequirements: params.packageVettingRequirements,
    synchronizerId: params.synchronizerId,
    vettingValidAt: params.vettingValidAt,
  }),
}); 