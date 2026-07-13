import { createApiOperation } from '../../../../../core';
import { UploadDarResponseSchema, type UploadDarResponse } from '../../../schemas/api';
import { UploadDarParamsSchema, type UploadDarParams } from '../../../schemas/operations';

/**
 * Upload a DAR to the participant package store.
 *
 * Canton vets every uploaded package by default. Set `vetAllPackages` to `false` to persist the DAR without changing
 * package-vetting state.
 */
export const UploadDar = createApiOperation<UploadDarParams, UploadDarResponse>({
  paramsSchema: UploadDarParamsSchema,
  method: 'POST',
  requestSemantics: 'mutation',
  buildUrl: (params, apiUrl): string => {
    const url = new URL(`${apiUrl}/v2/dars`);
    if (params.vetAllPackages !== undefined) {
      url.searchParams.set('vetAllPackages', String(params.vetAllPackages));
    }
    if (params.synchronizerId !== undefined) {
      url.searchParams.set('synchronizerId', params.synchronizerId);
    }
    return url.toString();
  },
  buildRequestData: (params): Buffer => params.darFile,
  requestConfig: {
    contentType: 'application/octet-stream',
    includeBearerToken: true,
  },
  responseSchema: UploadDarResponseSchema,
});
