import { z } from 'zod';
import { createRequestSchema, type SynchronizerId } from '../../../../core';
import type { paths } from '../../../../generated/canton/community/ledger/ledger-json-api/src/test/resources/json-api-docs/openapi';
import { DarFileSchema } from '../common';
import { LedgerSynchronizerIdSchema } from '../wire';

type ValidateDarEndpoint = '/v2/dars/validate';
type UploadDarEndpoint = '/v2/dars';

type ValidateDarOperation = paths[ValidateDarEndpoint]['post'];
type UploadDarOperation = paths[UploadDarEndpoint]['post'];
type NodeOctetStreamBody<OpenApiBody extends string> = OpenApiBody extends string ? Buffer : never;
type BrandedSynchronizerQuery<Query extends { synchronizerId?: string }> = {
  [Key in keyof Query]: Key extends 'synchronizerId' ? SynchronizerId : Query[Key];
};
type ValidateDarQuery = BrandedSynchronizerQuery<NonNullable<ValidateDarOperation['parameters']['query']>>;
type UploadDarQuery = BrandedSynchronizerQuery<NonNullable<UploadDarOperation['parameters']['query']>>;
type ValidateDarBody = NodeOctetStreamBody<ValidateDarOperation['requestBody']['content']['application/octet-stream']>;
type UploadDarBody = NodeOctetStreamBody<UploadDarOperation['requestBody']['content']['application/octet-stream']>;

/** A DAR request body must contain binary data; empty payloads cannot be valid DAR archives. */
export const NonEmptyDarFileSchema = DarFileSchema.refine((darFile) => darFile.length > 0, {
  message: 'DAR file must not be empty',
}).transform((darFile): Buffer => Buffer.from(darFile));

/** Exact parameters for the bodyless, read-only `POST /v2/dars/validate` endpoint. */
export type ValidateDarParams = ValidateDarQuery & {
  /** OpenAPI models `format: binary` as a string; the Node SDK transports immutable bytes instead. */
  darFile: ValidateDarBody;
};

export const ValidateDarParamsSchema = createRequestSchema<ValidateDarParams>()({
  /** DAR archive bytes. */
  darFile: NonEmptyDarFileSchema,
  /** Synchronizer against whose vetted packages upgrade compatibility should be checked. */
  synchronizerId: LedgerSynchronizerIdSchema.optional(),
});

/** Exact parameters for the mutating `POST /v2/dars` endpoint. */
export type UploadDarParams = UploadDarQuery & {
  /** OpenAPI models `format: binary` as a string; the Node SDK transports immutable bytes instead. */
  darFile: UploadDarBody;
};

export const UploadDarParamsSchema = createRequestSchema<UploadDarParams>()({
  /** DAR archive bytes. */
  darFile: NonEmptyDarFileSchema,
  /** Whether Canton should vet every uploaded package. Defaults to `true` on the server. */
  vetAllPackages: z.boolean().optional(),
  /** Target synchronizer for package vetting. */
  synchronizerId: LedgerSynchronizerIdSchema.optional(),
});
