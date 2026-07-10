import { createApiOperation } from '../../../../../core';
import { GetPreferredPackagesResponseSchema, type GetPreferredPackagesResponse } from '../../../schemas/api';
import {
  InteractiveSubmissionGetPreferredPackagesParamsSchema,
  type InteractiveSubmissionGetPreferredPackagesParams,
} from '../../../schemas/operations';

/**
 * Get the version of preferred packages for constructing a command submission
 *
 * @example
 *   ```typescript
 *   const result = await client.interactiveSubmissionGetPreferredPackages({
 *   packageVettingRequirements: [
 *   {
 *   parties: ['Alice', 'Bob'],
 *   packageName: 'my-package'
 *   }
 *   ],
 *   synchronizerId: 'sync-123'
 *   });
 *
 *   ```;
 */
export const InteractiveSubmissionGetPreferredPackages = createApiOperation<
  InteractiveSubmissionGetPreferredPackagesParams,
  GetPreferredPackagesResponse
>({
  paramsSchema: InteractiveSubmissionGetPreferredPackagesParamsSchema,
  responseSchema: GetPreferredPackagesResponseSchema,
  method: 'POST',
  requestSemantics: 'read',
  buildUrl: (_params: InteractiveSubmissionGetPreferredPackagesParams, apiUrl: string) =>
    `${apiUrl}/v2/interactive-submission/preferred-packages`,
  buildRequestData: (params: InteractiveSubmissionGetPreferredPackagesParams) => params,
});
