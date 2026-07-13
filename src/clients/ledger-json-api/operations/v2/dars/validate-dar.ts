import { createApiOperation } from '../../../../../core';
import { ValidateDarResponseSchema } from '../../../schemas/api';
import { ValidateDarParamsSchema, type ValidateDarParams } from '../../../schemas/operations';

/**
 * Validate a DAR and its package upgrades without changing participant or ledger state.
 *
 * The validated bytes are not persisted or vetted. When no synchronizer is supplied, Canton selects the target vetting
 * synchronizer according to the participant's package-management configuration.
 */
export const ValidateDar = createApiOperation<ValidateDarParams, void>({
  paramsSchema: ValidateDarParamsSchema,
  method: 'POST',
  requestSemantics: 'read',
  buildUrl: (params, apiUrl): string => {
    const url = new URL(`${apiUrl}/v2/dars/validate`);
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
  responseSchema: ValidateDarResponseSchema,
});
