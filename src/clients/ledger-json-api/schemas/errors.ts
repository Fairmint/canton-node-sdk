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

export const ValidationErrorSchema = ErrorResponseSchema.extend({
  /**
   * Details for a 400 Validation error.
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

export const ApiErrorResponseSchema = z.union([
  BadRequestErrorSchema,
  NotFoundErrorSchema,
  ValidationErrorSchema,
]);

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
export type BadRequestError = z.infer<typeof BadRequestErrorSchema>;
export type NotFoundError = z.infer<typeof NotFoundErrorSchema>;
export type ValidationError = z.infer<typeof ValidationErrorSchema>;
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>; 