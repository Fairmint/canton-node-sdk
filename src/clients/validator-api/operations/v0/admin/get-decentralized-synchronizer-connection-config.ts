import { z } from 'zod';
import { createApiOperation } from '../../../../../core';
import {
  type GetDecentralizedSynchronizerConnectionConfigResponse,
  GetDecentralizedSynchronizerConnectionConfigResponseSchema,
} from '../../../schemas/api/admin';

/**
 * Get the validator participant's connection configuration for the global synchronizer.
 *
 * The complete response is validated against the upstream Validator API contract before it is returned.
 */
export const GetDecentralizedSynchronizerConnectionConfig = createApiOperation<
  void,
  GetDecentralizedSynchronizerConnectionConfigResponse
>({
  paramsSchema: z.void(),
  method: 'GET',
  buildUrl: (_params, apiUrl: string): string =>
    `${apiUrl}/api/validator/v0/admin/participant/global-domain-connection-config`,
  transformResponse: (response): GetDecentralizedSynchronizerConnectionConfigResponse =>
    GetDecentralizedSynchronizerConnectionConfigResponseSchema.parse(response),
});
