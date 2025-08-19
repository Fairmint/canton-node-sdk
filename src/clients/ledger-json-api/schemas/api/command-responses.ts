import { z } from 'zod';

/**
 * Submit response for async command submission.
 */
export const SubmitResponseSchema = z.object({
  // Empty object as per OpenAPI spec
}).strict();

// Export types
export type SubmitResponse = z.infer<typeof SubmitResponseSchema>;