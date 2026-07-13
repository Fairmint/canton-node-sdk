import { z } from 'zod';
import { DarFileSchema } from '../common';
import { NonEmptyStringSchema } from './base';

/** A DAR request body must contain binary data; empty payloads cannot be valid DAR archives. */
export const NonEmptyDarFileSchema = DarFileSchema.refine((darFile) => darFile.length > 0, {
  message: 'DAR file must not be empty',
}).transform((darFile): Buffer => Buffer.from(darFile));

/** Exact parameters for the bodyless, read-only `POST /v2/dars/validate` endpoint. */
export const ValidateDarParamsSchema = z.strictObject({
  /** DAR archive bytes. */
  darFile: NonEmptyDarFileSchema,
  /** Synchronizer against whose vetted packages upgrade compatibility should be checked. */
  synchronizerId: NonEmptyStringSchema.optional(),
});

/** Exact parameters for the mutating `POST /v2/dars` endpoint. */
export const UploadDarParamsSchema = z.strictObject({
  /** DAR archive bytes. */
  darFile: NonEmptyDarFileSchema,
  /** Whether Canton should vet every uploaded package. Defaults to `true` on the server. */
  vetAllPackages: z.boolean().optional(),
  /** Target synchronizer for package vetting. */
  synchronizerId: NonEmptyStringSchema.optional(),
});

export type ValidateDarParams = z.infer<typeof ValidateDarParamsSchema>;
export type UploadDarParams = z.infer<typeof UploadDarParamsSchema>;
