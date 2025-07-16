import { BaseClient, createApiOperation } from '../../../../../core';
import { z } from 'zod';
import type { paths } from '../../../../../generated/openapi-types';
import { EventsByContractIdResponse } from '../../../schemas/api/events';

// Type aliases for better readability and to avoid repetition
type GetEventsByContractIdRequest = paths['/v2/events/events-by-contract-id']['post']['requestBody']['content']['application/json'];

// Schema for the parameters
export const EventsByContractIdParamsSchema = z.object({
  contractId: z.string(),
  readAs: z.array(z.string()).optional(),
});

export type EventsByContractIdParams = z.infer<typeof EventsByContractIdParamsSchema>;

/**
 * @description Retrieves events for a specific contract ID with filtering options
 * @example
 * ```typescript
 * const events = await client.getEventsByContractId({
 *   contractId: 'contract-123',
 *   readAs: ['party1', 'party2']
 * });
 * ```
 */
export const GetEventsByContractId = createApiOperation<
  EventsByContractIdParams,
  EventsByContractIdResponse
>({
  paramsSchema: EventsByContractIdParamsSchema,
  method: 'POST',
  buildUrl: (_params: EventsByContractIdParams, apiUrl: string) => `${apiUrl}/v2/events/events-by-contract-id`,
  buildRequestData: (params: EventsByContractIdParams, client: BaseClient): GetEventsByContractIdRequest => {
    const readParties = Array.from(
      new Set([
        client.getPartyId(),
        ...(params.readAs || []),
      ])
    );

    return {
      contractId: params.contractId,
      eventFormat: {
        verbose: true,
        filtersByParty: readParties.reduce(
          (acc, party) => {
            acc[party] = {
              cumulative: [],
            };
            return acc;
          },
          {} as Record<string, { cumulative: [] }>,
        ),
      },
    };
  },
}); 