import { EventsByContractIdResponse } from '../../clients/ledger-json-api/schemas';
import { validateEventsByContractIdResponse } from './eventsByContractIdValidator';

/**
 * Generic validator function type
 */
export type ValidatorFunction<T> = (response: unknown) => response is T;

/**
 * Registry of validators for different response types
 */
export const validators = {
  EventsByContractIdResponse: validateEventsByContractIdResponse as ValidatorFunction<EventsByContractIdResponse>,
} as const;

/**
 * Validates a response against a known type
 */
export function validateResponse<T>(
  response: unknown,
  typeName: keyof typeof validators
): response is T {
  const validator = validators[typeName];
  if (!validator) {
    throw new Error(`No validator found for type: ${typeName}`);
  }
  
  return validator(response);
}

/**
 * Type-safe way to get a validator for a specific type
 */
export function getValidator<T>(typeName: keyof typeof validators): ValidatorFunction<T> {
  return validators[typeName] as ValidatorFunction<T>;
} 