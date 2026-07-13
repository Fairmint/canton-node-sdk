import { z } from 'zod';

/** Normalize Axios' empty-string representation of a bodyless HTTP 200 response to `void`. */
export const ValidateDarResponseSchema: z.ZodType<void> = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.void()
);

/** The Ledger JSON API represents a successful DAR upload as an exact empty JSON object. */
export const UploadDarResponseSchema: z.ZodType<Record<string, never>> = z.strictObject({});

export type UploadDarResponse = z.infer<typeof UploadDarResponseSchema>;
