import { z } from 'zod';

export const ErrorResponseSchema = z.object({
  /** Error message describing the problem. */
  error: z.string(),
  /** Additional details about the error. */
  details: z.unknown(),
});

export const BadRequestErrorSchema = ErrorResponseSchema.extend({
  /**
   * Details for a 400 Bad Request error.
   */
  details: z.object({
    /** Optional error name. */
    name: z.string().optional(),
    /** Error message. */
    message: z.string(),
    /** HTTP status code (400). */
    status: z.literal(400).optional(),
    /** Optional error code. */
    code: z.string().optional(),
    /** Optional raw response. */
    response: z.unknown().optional(),
  }).optional(),
});

export const UnauthorizedErrorSchema = ErrorResponseSchema.extend({
  /**
   * Details for a 401 Unauthorized error.
   */
  details: z.object({
    /** Optional error name. */
    name: z.string().optional(),
    /** Error message. */
    message: z.string(),
    /** HTTP status code (401). */
    status: z.literal(401).optional(),
    /** Optional error code. */
    code: z.string().optional(),
    /** Optional raw response. */
    response: z.unknown().optional(),
  }).optional(),
});

export const ForbiddenErrorSchema = ErrorResponseSchema.extend({
  /**
   * Details for a 403 Forbidden error.
   */
  details: z.object({
    /** Optional error name. */
    name: z.string().optional(),
    /** Error message. */
    message: z.string(),
    /** HTTP status code (403). */
    status: z.literal(403).optional(),
    /** Optional error code. */
    code: z.string().optional(),
    /** Optional raw response. */
    response: z.unknown().optional(),
  }).optional(),
});

export const NotFoundErrorSchema = ErrorResponseSchema.extend({
  /**
   * Details for a 404 Not Found error.
   */
  details: z.object({
    /** Optional error name. */
    name: z.string().optional(),
    /** Error message. */
    message: z.string(),
    /** HTTP status code (404). */
    status: z.literal(404).optional(),
    /** Optional error code. */
    code: z.string().optional(),
    /** Optional raw response. */
    response: z.unknown().optional(),
  }).optional(),
});

export const ConflictErrorSchema = ErrorResponseSchema.extend({
  /**
   * Details for a 409 Conflict error.
   */
  details: z.object({
    /** Optional error name. */
    name: z.string().optional(),
    /** Error message. */
    message: z.string(),
    /** HTTP status code (409). */
    status: z.literal(409).optional(),
    /** Optional error code. */
    code: z.string().optional(),
    /** Optional raw response. */
    response: z.unknown().optional(),
  }).optional(),
});

export const UnprocessableEntityErrorSchema = ErrorResponseSchema.extend({
  /**
   * Details for a 422 Unprocessable Entity error.
   */
  details: z.object({
    /** Optional error name. */
    name: z.string().optional(),
    /** Error message. */
    message: z.string(),
    /** HTTP status code (422). */
    status: z.literal(422).optional(),
    /** Optional error code. */
    code: z.string().optional(),
    /** Optional raw response. */
    response: z.unknown().optional(),
  }).optional(),
});

export const TooManyRequestsErrorSchema = ErrorResponseSchema.extend({
  /**
   * Details for a 429 Too Many Requests error.
   */
  details: z.object({
    /** Optional error name. */
    name: z.string().optional(),
    /** Error message. */
    message: z.string(),
    /** HTTP status code (429). */
    status: z.literal(429).optional(),
    /** Optional error code. */
    code: z.string().optional(),
    /** Optional raw response. */
    response: z.unknown().optional(),
  }).optional(),
});

export const InternalServerErrorSchema = ErrorResponseSchema.extend({
  /**
   * Details for a 500 Internal Server Error.
   */
  details: z.object({
    /** Optional error name. */
    name: z.string().optional(),
    /** Error message. */
    message: z.string(),
    /** HTTP status code (500). */
    status: z.literal(500).optional(),
    /** Optional error code. */
    code: z.string().optional(),
    /** Optional raw response. */
    response: z.unknown().optional(),
  }).optional(),
});

export const ServiceUnavailableErrorSchema = ErrorResponseSchema.extend({
  /**
   * Details for a 503 Service Unavailable error.
   */
  details: z.object({
    /** Optional error name. */
    name: z.string().optional(),
    /** Error message. */
    message: z.string(),
    /** HTTP status code (503). */
    status: z.literal(503).optional(),
    /** Optional error code. */
    code: z.string().optional(),
    /** Optional raw response. */
    response: z.unknown().optional(),
  }).optional(),
});

/**
 * Error code kind (oneOf all error code types).
 */
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

/**
 * Error code details.
 */
export const JsErrorCodeSchema = z.object({
  /** The kind of error code. */
  kind: JsErrorCodeKindSchema,
});

/**
 * Canton error details.
 */
export const JsCantonErrorSchema = z.object({
  /** Error code. */
  code: JsErrorCodeSchema,
  /** Error message. */
  message: z.string(),
  /** Error details (optional). */
  details: z.record(z.string(), z.any()).optional(),
});

/**
 * Generic error details.
 */
export const JsErrorSchema = z.object({
  /** Error code. */
  code: JsErrorCodeSchema,
  /** Error message. */
  message: z.string(),
  /** Error details (optional). */
  details: z.record(z.string(), z.any()).optional(),
});

// Export types
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