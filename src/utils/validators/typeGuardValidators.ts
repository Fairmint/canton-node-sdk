/**
 * Type guard validation utilities
 */

/**
 * Validates that a type is not unknown or any
 */
export function validateNotUnknownOrAny(
  value: unknown,
  typeName: string
): void {
  // Check if the value is explicitly typed as unknown or any
  if (value === undefined && typeName.includes('unknown')) {
    throw new Error(`${typeName} cannot be of type 'unknown'`);
  }

  if (value === undefined && typeName.includes('any')) {
    throw new Error(`${typeName} cannot be of type 'any'`);
  }
}

/**
 * Validates that a value is not null and not of unknown or any type
 */
export function validateNotNull<T>(
  value: T | null,
  typeName: string
): value is T {
  if (value === null) {
    throw new Error(`${typeName} cannot be null`);
  }
  return true;
}

/**
 * Type guard to check if a value matches a specific type
 */
export function isType<T>(
  value: unknown,
  validator: (value: unknown, typeName: string) => value is T,
  typeName: string
): value is T {
  return validator(value, typeName);
} 