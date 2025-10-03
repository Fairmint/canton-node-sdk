import { z } from 'zod';

export const NonEmptyStringSchema = z
  .string()
  .min(1, 'Value must be a non-empty string')
  .refine((val) => val !== 'undefined', 'Value cannot be "undefined"');
