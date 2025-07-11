import { createApiOperation } from '../../../../../core';
import { UploadDarFileParamsSchema, UploadDarFileParams } from '../../../schemas/operations';
import { UploadDarFileResponse } from '../../../schemas/api';

/**
 * @description Upload a DAR file to the participant node
 * @example
 * ```typescript
 * const result = await client.uploadDarFile({
 *   darFile: fs.readFileSync('my-package.dar'),
 *   submissionId: 'unique-submission-id'
 * });
 * ```
 * @param darFile - DAR file content as a buffer or string
 * @param submissionId - Optional submission ID for deduplication
 */
export const UploadDarFile = createApiOperation<
  UploadDarFileParams,
  UploadDarFileResponse
>({
  paramsSchema: UploadDarFileParamsSchema,
  method: 'POST',
  buildUrl: (params: UploadDarFileParams, apiUrl: string) => {
    const baseUrl = `${apiUrl}/v2/packages`;
    const queryParams = new URLSearchParams();
    
    if (params.submissionId) {
      queryParams.append('submission_id', params.submissionId);
    }

    const queryString = queryParams.toString();
    return queryString ? `${baseUrl}?${queryString}` : baseUrl;
  },
  buildRequestData: (params: UploadDarFileParams) => {
    // Return the DAR file content as the request body
    return params.darFile;
  },
}); 