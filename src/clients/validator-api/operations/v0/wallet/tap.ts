import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { createApiOperation, createRequestSchema } from '../../../../../core';
import { type operations } from '../../../../../generated/apps/wallet/src/main/openapi/wallet-internal';

const DAML_DECIMAL_PATTERN = /^-?\d{1,28}(?:\.\d{1,10})?$/;

export type TapParams = operations['tap']['requestBody']['content']['application/json'];
export type TapResponse = operations['tap']['responses']['200']['content']['application/json'];

/** Runtime schema kept in exact key/type parity with the generated wallet tap request. */
export const TapParamsSchema = createRequestSchema<TapParams>()({
  amount: z.string().regex(DAML_DECIMAL_PATTERN),
  command_id: z.string().min(1).optional(),
});

/** Create development-network CC for the authenticated wallet. */
export const Tap = createApiOperation<TapParams, TapResponse>({
  paramsSchema: TapParamsSchema,
  method: 'POST',
  buildUrl: (_params, apiUrl: string): string => `${apiUrl}/api/validator/v0/wallet/tap`,
  // Generate the deduplication key before BaseClient's HTTP retry loop so an ambiguous response cannot mint twice.
  buildRequestData: (params): TapParams => ({
    ...params,
    command_id: params.command_id ?? randomUUID(),
  }),
});
