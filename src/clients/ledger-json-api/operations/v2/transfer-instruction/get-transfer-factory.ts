import { createApiOperation } from '../../../../../core';
import { GetTransferFactoryParams, GetTransferFactoryParamsSchema } from '../../../schemas/operations';
import { GetTransferFactoryResponse } from '../../../schemas/api/transfer-instruction';

/**
 * @description Get the factory and choice context for executing a direct transfer
 * @example
 * ```typescript
 * const factory = await client.getTransferFactory({
 *   choiceArguments: { /* choice arguments *\/ },
 *   excludeDebugFields: false
 * });
 * console.log(`Factory ID: ${factory.factoryId}`);
 * ```
 */
export const GetTransferFactory = createApiOperation<
  GetTransferFactoryParams,
  GetTransferFactoryResponse
>({
  paramsSchema: GetTransferFactoryParamsSchema,
  method: 'POST',
  buildUrl: (_params: GetTransferFactoryParams, apiUrl: string) => 
    `${apiUrl}/registry/transfer-instruction/v1/transfer-factory`,
}); 