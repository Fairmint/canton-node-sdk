import { z } from 'zod';
import { NonEmptyStringSchema } from './base';

export const GetEventsByContractIdParamsSchema = z.object({
  /** Contract ID to fetch events for. */
  contractId: NonEmptyStringSchema,
  /** Additional parties to read as (optional). */
  readAs: z.array(z.string()).optional(),
});

export type GetEventsByContractIdParams = z.infer<typeof GetEventsByContractIdParamsSchema>; 