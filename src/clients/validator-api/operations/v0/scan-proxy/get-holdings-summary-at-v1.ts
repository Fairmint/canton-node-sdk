import { z } from 'zod';
import { createApiOperation, createRequestSchema } from '../../../../../core';
import { type operations } from '../../../../../generated/apps/validator/src/main/openapi/scan-proxy';

type GeneratedGetHoldingsSummaryAtV1Params =
  operations['getHoldingsSummaryAtV1']['requestBody']['content']['application/json'];
export type GetHoldingsSummaryAtV1Params = Omit<GeneratedGetHoldingsSummaryAtV1Params, 'record_time_match'> & {
  /** Defaults to `exact` when omitted. */
  readonly record_time_match?: GeneratedGetHoldingsSummaryAtV1Params['record_time_match'];
};
export type GetHoldingsSummaryAtV1Response =
  operations['getHoldingsSummaryAtV1']['responses']['200']['content']['application/json'];

/** Runtime schema kept in exact key/type parity with the generated holdings-summary request. */
export const GetHoldingsSummaryAtV1ParamsSchema = createRequestSchema<GetHoldingsSummaryAtV1Params>()({
  migration_id: z.number().int(),
  record_time: z.iso.datetime({ offset: true }),
  record_time_match: z.enum(['exact', 'at_or_before']).optional(),
  owner_party_ids: z.array(z.string()).min(1),
});

/** Get a holdings summary without the deprecated holding-fee aggregates. */
export const GetHoldingsSummaryAtV1 = createApiOperation<GetHoldingsSummaryAtV1Params, GetHoldingsSummaryAtV1Response>({
  paramsSchema: GetHoldingsSummaryAtV1ParamsSchema,
  method: 'POST',
  buildUrl: (_params, apiUrl: string) => `${apiUrl}/api/validator/v1/scan-proxy/holdings/summary`,
  buildRequestData: (params): GetHoldingsSummaryAtV1Params => params,
});
