import { z } from 'zod';
import * as fs from 'fs';
import { UploadDarFileResponse } from '../../../schemas/api';
import { createApiOperation } from '../../../../../core';

// Schema for the parameters  
export const UploadDarFileParamsSchema = z.object({
  /** Path to the DAR file */
  filePath: z.string(),
  /** Optional submission ID for deduplication */
  submissionId: z.string().optional(),
});

export type UploadDarFileParams = z.infer<typeof UploadDarFileParamsSchema>;

/**
 * @description Upload a DAR file to the participant node
 * @example
 * ```typescript
 * const result = await client.uploadDarFile({
 *   filePath: 'my-package.dar',
 *   submissionId: 'unique-submission-id'
 * });
 * ```
 * @param filePath - Path to the DAR file
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
  buildRequestData: (params: UploadDarFileParams): Buffer => {
    // Check if file exists
    if (!fs.existsSync(params.filePath)) {
      throw new Error(`File not found: ${params.filePath}`);
    }
    // Read the file as a buffer
    return fs.readFileSync(params.filePath);
  },
  requestConfig: {
    contentType: 'application/octet-stream',
    includeBearerToken: true
  }
}); 