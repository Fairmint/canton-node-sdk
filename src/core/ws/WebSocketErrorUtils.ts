import { z } from 'zod';
import { CantonError } from '../errors';

/** Utility functions for consistent WebSocket error handling */
export class WebSocketErrorUtils {
  /**
   * Parses a union schema and returns the result without type assertion
   *
   * @param msg - The message to parse
   * @param unionSchema - The Zod union schema
   * @param operationName - Name of the operation for error context
   * @returns The parsed message with proper typing
   * @throws CantonError if parsing fails
   */
  static parseUnion<T>(msg: unknown, unionSchema: z.ZodSchema<T>, operationName: string): T {
    try {
      return unionSchema.parse(msg);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new CantonError(
          `Failed to parse ${operationName} message: ${error.issues.map((e) => e.message).join(', ')}`,
          'VALIDATION_ERROR',
          { originalMessage: msg, validationErrors: error.issues }
        );
      }
      throw new CantonError(
        `Failed to parse ${operationName} message: ${error instanceof Error ? error.message : String(error)}`,
        'VALIDATION_ERROR',
        { originalMessage: msg }
      );
    }
  }

  /**
   * Creates a safe JSON parser that throws descriptive errors
   *
   * @param data - Raw data to parse
   * @param context - Context for error messages
   * @returns Parsed JSON object
   * @throws CantonError if JSON parsing fails
   */
  static safeJsonParse(data: string, context: string): unknown {
    try {
      return JSON.parse(data);
    } catch (error) {
      throw new CantonError(
        `Failed to parse JSON in ${context}: ${error instanceof Error ? error.message : String(error)}`,
        'VALIDATION_ERROR',
        { rawData: data, context }
      );
    }
  }
}
