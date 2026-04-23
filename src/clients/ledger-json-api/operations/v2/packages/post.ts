import * as fs from 'fs';
import { z } from 'zod';
import { createApiOperation } from '../../../../../core';
import { type UploadDarFileResponse } from '../../../schemas/api';

// Schema for the parameters
export const UploadDarFileParamsSchema = z.object({
  /** Path to the DAR file */
  filePath: z.string(),
  /** Optional submission ID for deduplication */
  submissionId: z.string().optional(),
  /**
   * When true (default), Canton vets all packages after upload and runs upgrade-compatibility checks.
   * Set false to upload into the package store only; vet separately (e.g. with force flags) if needed.
   */
  vetAllPackages: z.boolean().optional(),
  /** Synchronizer id for vetting when vetAllPackages is true (optional; Canton may auto-detect). */
  synchronizerId: z.string().optional(),
});

export type UploadDarFileParams = z.infer<typeof UploadDarFileParamsSchema>;

/**
 * Upload a DAR file to the participant node
 *
 * @example
 *   ```typescript
 *   const result = await client.uploadDarFile({
 *     filePath: 'my-package.dar',
 *     submissionId: 'unique-submission-id'
 *   });
 *   ```;
 *
 * @param filePath - Path to the DAR file
 * @param submissionId - Optional submission ID for deduplication
 */
export const UploadDarFile = createApiOperation<UploadDarFileParams, UploadDarFileResponse>({
  paramsSchema: UploadDarFileParamsSchema,
  method: 'POST',
  buildUrl: (params: UploadDarFileParams, apiUrl: string) => {
    const baseUrl = `${apiUrl}/v2/packages`;
    const queryParams = new URLSearchParams();

    if (params.submissionId) {
      queryParams.append('submission_id', params.submissionId);
    }
    if (params.vetAllPackages === false) {
      queryParams.append('vetAllPackages', 'false');
    }
    if (params.synchronizerId) {
      queryParams.append('synchronizerId', params.synchronizerId);
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
    includeBearerToken: true,
  },
});
