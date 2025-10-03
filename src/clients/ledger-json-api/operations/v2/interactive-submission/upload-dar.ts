import { createApiOperation } from '../../../../../core';
import { InteractiveSubmissionUploadDarParamsSchema, type InteractiveSubmissionUploadDarParams } from '../../../schemas/operations';
import { type InteractiveSubmissionUploadDarResponse } from '../../../schemas/api';

/**
 * @description Upload DAR file interactively
 * @example
 * ```typescript
 * const result = await client.interactiveSubmissionUploadDar({
 *   darFile: fs.readFileSync('my-package.dar')
 * });
 * console.log('DAR file uploaded successfully');
 * ```
 */
export const InteractiveSubmissionUploadDar = createApiOperation<
  InteractiveSubmissionUploadDarParams,
  InteractiveSubmissionUploadDarResponse
>({
  paramsSchema: InteractiveSubmissionUploadDarParamsSchema,
  method: 'POST',
  buildUrl: (_params: InteractiveSubmissionUploadDarParams, apiUrl: string) => `${apiUrl}/v2/interactive-submission/upload-dar`,
  buildRequestData: (params: InteractiveSubmissionUploadDarParams) => 
    // Return the DAR file content as the request body
     params.darFile
  ,
}); 