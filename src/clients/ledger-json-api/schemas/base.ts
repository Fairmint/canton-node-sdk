import { z } from 'zod';

/**
 * Generic record schema allowing string, number, boolean, null, nested objects, and arrays. Used for contract arguments
 * and choice arguments.
 */
export const RecordSchema = z.record(
  z.string(),
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.record(z.string(), z.any()), // Allow nested objects
    z.array(z.any()), // Allow arrays
  ])
);
