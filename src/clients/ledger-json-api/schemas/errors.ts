import { z } from 'zod';

// Common error response structure
export const ErrorResponseSchema = z.object({
  error: z.string(),
  details: z.unknown(),
});

// Specific error response types for different HTTP status codes
export const BadRequestErrorSchema = ErrorResponseSchema.extend({
  details: z.object({
    name: z.string().optional(),
    message: z.string(),
    status: z.literal(400).optional(),
    code: z.string().optional(),
    response: z.unknown().optional(),
  }).optional(),
});

export const NotFoundErrorSchema = ErrorResponseSchema.extend({
  details: z.object({
    name: z.string().optional(),
    message: z.string(),
    status: z.literal(404).optional(),
    code: z.string().optional(),
    response: z.unknown().optional(),
  }).optional(),
});

export const ValidationErrorSchema = ErrorResponseSchema.extend({
  details: z.object({
    name: z.string().optional(),
    message: z.string(),
    status: z.literal(400).optional(),
    code: z.string().optional(),
    response: z.unknown().optional(),
  }).optional(),
});

// Union type for all error responses
export const ApiErrorResponseSchema = z.union([
  BadRequestErrorSchema,
  NotFoundErrorSchema,
  ValidationErrorSchema,
]);

// Type exports
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
export type BadRequestError = z.infer<typeof BadRequestErrorSchema>;
export type NotFoundError = z.infer<typeof NotFoundErrorSchema>;
export type ValidationError = z.infer<typeof ValidationErrorSchema>;
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>; 