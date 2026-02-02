import { z } from 'zod';
import { RecordSchema } from '../base';

export const ErrorResponseSchema = z.object({
  /** Error message describing the problem. */
  error: z.string(),
  /** Additional details about the error. */
  details: RecordSchema.optional(),
});

/** Common error details schema for HTTP error responses. */
const HttpErrorDetailsSchema = z.object({
  /** Optional error name. */
  name: z.string().optional(),
  /** Error message. */
  message: z.string(),
  /** HTTP status code. */
  status: z.number().optional(),
  /** Optional error code. */
  code: z.string().optional(),
  /** Optional raw response data. */
  response: RecordSchema.optional(),
});

export const BadRequestErrorSchema = ErrorResponseSchema.extend({
  /** Details for a 400 Bad Request error. */
  details: HttpErrorDetailsSchema.extend({ status: z.literal(400).optional() }).optional(),
});

export const UnauthorizedErrorSchema = ErrorResponseSchema.extend({
  /** Details for a 401 Unauthorized error. */
  details: HttpErrorDetailsSchema.extend({ status: z.literal(401).optional() }).optional(),
});

export const ForbiddenErrorSchema = ErrorResponseSchema.extend({
  /** Details for a 403 Forbidden error. */
  details: HttpErrorDetailsSchema.extend({ status: z.literal(403).optional() }).optional(),
});

export const NotFoundErrorSchema = ErrorResponseSchema.extend({
  /** Details for a 404 Not Found error. */
  details: HttpErrorDetailsSchema.extend({ status: z.literal(404).optional() }).optional(),
});

export const ConflictErrorSchema = ErrorResponseSchema.extend({
  /** Details for a 409 Conflict error. */
  details: HttpErrorDetailsSchema.extend({ status: z.literal(409).optional() }).optional(),
});

export const UnprocessableEntityErrorSchema = ErrorResponseSchema.extend({
  /** Details for a 422 Unprocessable Entity error. */
  details: HttpErrorDetailsSchema.extend({ status: z.literal(422).optional() }).optional(),
});

export const TooManyRequestsErrorSchema = ErrorResponseSchema.extend({
  /** Details for a 429 Too Many Requests error. */
  details: HttpErrorDetailsSchema.extend({ status: z.literal(429).optional() }).optional(),
});

export const InternalServerErrorSchema = ErrorResponseSchema.extend({
  /** Details for a 500 Internal Server Error. */
  details: HttpErrorDetailsSchema.extend({ status: z.literal(500).optional() }).optional(),
});

export const ServiceUnavailableErrorSchema = ErrorResponseSchema.extend({
  /** Details for a 503 Service Unavailable error. */
  details: HttpErrorDetailsSchema.extend({ status: z.literal(503).optional() }).optional(),
});

/** Error code kind (oneOf all error code types). */
export const JsErrorCodeKindSchema = z.union([
  z.object({ JsAborted: z.object({}) }),
  z.object({ JsContractNotFound: z.object({}) }),
  z.object({ JsDisconnected: z.object({}) }),
  z.object({ JsDuplicateCommand: z.object({}) }),
  z.object({ JsInconsistent: z.object({}) }),
  z.object({ JsInvalidArgument: z.object({}) }),
  z.object({ JsInvalidLedgerTime: z.object({}) }),
  z.object({ JsOutOfQuota: z.object({}) }),
  z.object({ JsPartyNotKnownOnLedger: z.object({}) }),
  z.object({ JsResourceExhausted: z.object({}) }),
  z.object({ JsSubmitterCannotActViaParticipant: z.object({}) }),
  z.object({ JsTemplateNotFound: z.object({}) }),
  z.object({ JsTimedOut: z.object({}) }),
  z.object({ JsTransactionNotFound: z.object({}) }),
  z.object({ JsUnauthenticated: z.object({}) }),
  z.object({ JsUnknown: z.object({}) }),
  z.object({ JsUnsupported: z.object({}) }),
  z.object({ JsUserManagement: z.object({}) }),
  z.object({ JsValueNotFound: z.object({}) }),
]);

/** Error code details. */
export const JsErrorCodeSchema = z.object({
  /** The kind of error code. */
  kind: JsErrorCodeKindSchema,
});

/** Canton error details. */
export const JsCantonErrorSchema = z.object({
  /** Error code. */
  code: JsErrorCodeSchema,
  /** Error message. */
  message: z.string(),
  /** Error details (optional) - structure varies by error code */
  details: RecordSchema.optional(),
});

/** Generic error details. */
export const JsErrorSchema = z.object({
  /** Error code. */
  code: JsErrorCodeSchema,
  /** Error message. */
  message: z.string(),
  /** Error details (optional) - structure varies by error code */
  details: RecordSchema.optional(),
});

// Export types
export type HttpErrorDetails = z.infer<typeof HttpErrorDetailsSchema>;
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
export type BadRequestError = z.infer<typeof BadRequestErrorSchema>;
export type UnauthorizedError = z.infer<typeof UnauthorizedErrorSchema>;
export type ForbiddenError = z.infer<typeof ForbiddenErrorSchema>;
export type NotFoundError = z.infer<typeof NotFoundErrorSchema>;
export type ConflictError = z.infer<typeof ConflictErrorSchema>;
export type UnprocessableEntityError = z.infer<typeof UnprocessableEntityErrorSchema>;
export type TooManyRequestsError = z.infer<typeof TooManyRequestsErrorSchema>;
export type InternalServerError = z.infer<typeof InternalServerErrorSchema>;
export type ServiceUnavailableError = z.infer<typeof ServiceUnavailableErrorSchema>;
export type JsErrorCodeKind = z.infer<typeof JsErrorCodeKindSchema>;
export type JsErrorCode = z.infer<typeof JsErrorCodeSchema>;
export type JsCantonError = z.infer<typeof JsCantonErrorSchema>;
export type JsError = z.infer<typeof JsErrorSchema>;

/**
 * WebSocket Canton error details (per AsyncAPI schema for WS endpoints). Note: WS errors differ from REST errors and
 * include fields like `cause` and string `code`.
 */
export const WsCantonErrorSchema = z.object({
  code: z.string(),
  cause: z.string(),
  correlationId: z.string().nullable().optional(),
  traceId: z.string().nullable().optional(),
  /** Error context - additional contextual information about the error */
  context: RecordSchema.nullable().optional(),
  resources: z
    .array(z.tuple([z.string(), z.string()]))
    .nullable()
    .optional(),
  errorCategory: z.number().int(),
  grpcCodeValue: z.number().int().nullable().optional(),
  retryInfo: z.string().nullable().optional(),
  definiteAnswer: z.boolean().nullable().optional(),
});

export type WsCantonError = z.infer<typeof WsCantonErrorSchema>;
