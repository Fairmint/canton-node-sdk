import { z } from 'zod';
import { createApiOperation } from '../../../../../../../../core';
import type { paths } from '../../../../../../../../generated/token-standard/splice-api-token-transfer-instruction-v1/openapi/transfer-instruction-v1';

type ApiPath = '/registry/transfer-instruction/v1/transfer-factory';

const endpoint = '/api/validator/v0/scan-proxy/registry/transfer-instruction/v1/transfer-factory';

// Simple schema that matches the generated type exactly
export const GetTransferFactoryParamsSchema = z.object({
  choiceArguments: z.record(z.string(), z.never()),
  excludeDebugFields: z.boolean().optional(),
});

export type GetTransferFactoryParams = z.infer<typeof GetTransferFactoryParamsSchema>;
export type GetTransferFactoryRequest = paths[ApiPath]['post']['requestBody']['content']['application/json'];
export type GetTransferFactoryResponse = paths[ApiPath]['post']['responses']['200']['content']['application/json'];

/**
 * Get the factory and choice context for executing a direct transfer
 *
 * @example
 *   ```typescript
 *   const factory = await client.getTransferFactory({
 *   choiceArguments: { /* choice arguments *\/ },
 *   excludeDebugFields: false
 *   });
 *
 *   ```;
 */
export const GetTransferFactory = createApiOperation<GetTransferFactoryParams, GetTransferFactoryResponse>({
  paramsSchema: GetTransferFactoryParamsSchema,
  method: 'POST',
  buildUrl: (_params: GetTransferFactoryParams, apiUrl: string) => `${apiUrl}${endpoint}`,
  buildRequestData: (params: GetTransferFactoryParams): GetTransferFactoryRequest => ({
    choiceArguments: params.choiceArguments,
    excludeDebugFields: params.excludeDebugFields ?? false,
  }),
});
