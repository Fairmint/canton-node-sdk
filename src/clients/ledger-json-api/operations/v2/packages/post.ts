import { z } from 'zod';
import { UploadDarFileResponse } from '../../../schemas/api';
import { createApiOperation } from '../../../../../core';

// Schema for the parameters  
export const UploadDarFileParamsSchema = z.object({
  /** DAR file content as a buffer or string */
  darFile: z.union([z.instanceof(Buffer), z.string()]),
  /** Optional submission ID for deduplication */
  submissionId: z.string().optional(),
});

export type UploadDarFileParams = z.infer<typeof UploadDarFileParamsSchema>;

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
  buildRequestData: (params: UploadDarFileParams): string => {
    // Convert to string if it's a Buffer
    if (Buffer.isBuffer(params.darFile)) {
      return params.darFile.toString('base64');
    }
    return params.darFile;
  },
}); 