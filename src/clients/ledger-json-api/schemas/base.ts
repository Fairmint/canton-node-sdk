import { z } from 'zod';

// Base schemas for common types - updated to handle nested objects and arrays
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