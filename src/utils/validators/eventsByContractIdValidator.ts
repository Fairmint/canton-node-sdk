import { 
  EventsByContractIdResponse,
  EventsByContractIdResponseSchema,
  CreatedEventSchema,
  ArchivedEventSchema
} from '../../clients/ledger-json-api/schemas';
import { z } from 'zod';

/**
 * Validates that a response matches the EventsByContractIdResponse type exactly
 * This ensures no extra fields are present and all required fields exist
 */
export function validateEventsByContractIdResponse(
  response: unknown
): response is EventsByContractIdResponse {
  try {
    EventsByContractIdResponseSchema.parse(response);
    return true;
  } catch (error) {
    if (error instanceof z.ZodError) {
      // Format error messages to match the expected test output
      const errors = error.errors.map(e => {
        if (e.code === 'unrecognized_keys') {
          return `EventsByContractIdResponse has unexpected properties: ${e.keys?.join(', ')}`;
        }
        if (e.code === 'invalid_type' && e.received === 'string') {
          return `EventsByContractIdResponse must be an object, got string`;
        }
        return `${e.path.join('.')}: ${e.message}`;
      });
      throw new Error(errors.join(', '));
    }
    throw error;
  }
}

/**
 * Validates that a response matches the EventsByContractIdResponse type
 * This allows extra fields but ensures all required fields exist
 */
export function validateEventsByContractIdResponseShape(
  response: unknown
): response is EventsByContractIdResponse {
  try {
    // For shape validation, we'll use a more permissive approach
    const baseSchema = z.object({
      created: CreatedEventSchema.optional(),
      archived: ArchivedEventSchema.optional(),
    }).passthrough();
    
    baseSchema.parse(response);
    
    // Still check that at least one is present
    const typedResponse = response as EventsByContractIdResponse;
    if (!typedResponse.created && !typedResponse.archived) {
      throw new Error('EventsByContractIdResponse must have at least one of: created, archived');
    }
    
    return true;
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`Validation failed: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
    }
    throw error;
  }
}

// Export the schemas for use elsewhere if needed
export { 
  CreatedEventSchema, 
  ArchivedEventSchema, 
  EventsByContractIdResponseSchema 
}; 