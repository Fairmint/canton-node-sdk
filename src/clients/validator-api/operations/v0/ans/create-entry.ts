import { z } from 'zod';
import { createApiOperation } from '../../../../../core';
import { type operations } from '../../../../../generated/apps/validator/src/main/openapi/ans-external';

const CreateAnsEntryParamsSchema = z.object({
  name: z.string(),
  url: z.string(),
  description: z.string(),
});

/**
 * Create a new ANS entry
 *
 * @example
 *   ```typescript
 *   const entry = await client.createAnsEntry({
 *   name: 'my-app',
 *   url: 'https://my-app.com',
 *   description: 'My application'
 *   });
 *
 *   ```;
 */
export const CreateAnsEntry = createApiOperation<
  operations['createAnsEntry']['requestBody']['content']['application/json'],
  operations['createAnsEntry']['responses']['200']['content']['application/json']
>({
  paramsSchema: CreateAnsEntryParamsSchema,
  method: 'POST',
  buildUrl: (_params, apiUrl: string) => `${apiUrl}/api/validator/v0/entry/create`,
  buildRequestData: (params) => params,
});
