import { z } from 'zod';

/**
 * JSON value type for recursive schema definitions. Used for contract arguments and choice arguments where the
 * structure is dynamic.
 */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/**
 * Recursive JSON schema that allows arbitrarily nested structures. This is type-safe (uses unknown internally) while
 * still allowing the full range of JSON values.
 */
const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
  ])
);

/**
 * Generic record schema allowing string, number, boolean, null, nested objects, and arrays. Used for contract arguments
 * and choice arguments.
 */
export const RecordSchema = z.record(z.string(), JsonValueSchema);
