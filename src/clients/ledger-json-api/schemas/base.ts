import { z } from 'zod';

export const RecordSchema = z.record(
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.record(z.any()), // Allow nested objects
    z.array(z.any()), // Allow arrays
  ])
); 