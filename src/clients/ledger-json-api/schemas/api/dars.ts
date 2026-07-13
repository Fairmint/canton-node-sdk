import { z } from 'zod';
import type { paths } from '../../../../generated/canton/community/ledger/ledger-json-api/src/test/resources/json-api-docs/openapi';

type UploadDarEndpoint = '/v2/dars';
type ValidateDarEndpoint = '/v2/dars/validate';
type NoContentSuccess<OpenApiResponse extends { content?: never }> = OpenApiResponse extends {
  content?: never;
}
  ? void
  : never;

/** Exact successful response from the pinned Ledger DAR validation endpoint. */
export type ValidateDarResponse = NoContentSuccess<paths[ValidateDarEndpoint]['post']['responses']['200']>;

/** Exact successful response from the pinned Ledger DAR upload endpoint. */
export type UploadDarResponse = paths[UploadDarEndpoint]['post']['responses']['200']['content']['application/json'];

/** Normalize Axios' empty-string representation of a bodyless HTTP 200 response to `void`. */
export const ValidateDarResponseSchema: z.ZodType<ValidateDarResponse> = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.void()
);

/** The Ledger JSON API represents a successful DAR upload as an exact empty JSON object. */
export const UploadDarResponseSchema: z.ZodType<UploadDarResponse> = z.strictObject({});
