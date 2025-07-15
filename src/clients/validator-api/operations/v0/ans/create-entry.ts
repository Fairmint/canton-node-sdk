import { createApiOperation } from '../../../../../core';
import { CreateAnsEntryResponse } from '../../../schemas/api';
import { CreateAnsEntryParamsSchema } from '../../../schemas/operations';

/**
 * @description Create a new ANS entry
 * @example
 * ```typescript
 * const entry = await client.createAnsEntry({
 *   name: 'my-app',
 *   url: 'https://my-app.com',
 *   description: 'My application'
 * });
 * console.log(`Entry created: ${entry.entryContextCid}`);
 * ```
 */
export const CreateAnsEntry = createApiOperation<
  typeof CreateAnsEntryParamsSchema._type,
  CreateAnsEntryResponse
>({
  paramsSchema: CreateAnsEntryParamsSchema,
  method: 'POST',
  buildUrl: (_params, apiUrl: string) => `${apiUrl}/api/validator/v0/ans/entries`,
  buildRequestData: (params) => params,
}); 