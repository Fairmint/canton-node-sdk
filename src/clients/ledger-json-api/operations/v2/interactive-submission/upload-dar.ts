import { createApiOperation } from '../../../../../core';
import { type InteractiveSubmissionUploadDarResponse } from '../../../schemas/api';
import {
  InteractiveSubmissionUploadDarParamsSchema,
  type InteractiveSubmissionUploadDarParams,
} from '../../../schemas/operations';

/**
 * Upload DAR file interactively
 *
 * @example
 *   ```typescript
 *   const result = await client.interactiveSubmissionUploadDar({
 *     darFile: fs.readFileSync('my-package.dar')
 *   });
 *
 *   ```;
 */
export const InteractiveSubmissionUploadDar = createApiOperation<
  InteractiveSubmissionUploadDarParams,
  InteractiveSubmissionUploadDarResponse
>({
  paramsSchema: InteractiveSubmissionUploadDarParamsSchema,
  method: 'POST',
  buildUrl: (_params: InteractiveSubmissionUploadDarParams, apiUrl: string) =>
    `${apiUrl}/v2/interactive-submission/upload-dar`,
  buildRequestData: (params: InteractiveSubmissionUploadDarParams) =>
    // Return the DAR file content as the request body
    params.darFile,
});
