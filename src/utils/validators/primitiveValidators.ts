/**
 * Primitive type validation utilities
 */

/**
 * Validates that a value is a string
 */
export function validateString(
  value: unknown,
  typeName: string
): value is string {
  if (typeof value !== 'string') {
    throw new Error(`${typeName} must be a string, got ${typeof value}`);
  }
  return true;
}

/**
 * Validates that a value is a string or undefined
 */
export function validateOptionalString(
  value: unknown,
  typeName: string
): value is string | undefined {
  if (value !== undefined && typeof value !== 'string') {
    throw new Error(
      `${typeName} must be a string or undefined, got ${typeof value}`
    );
  }
  return true;
}

/**
 * Validates that a value is a number
 */
export function validateNumber(
  value: unknown,
  typeName: string
): value is number {
  if (typeof value !== 'number') {
    throw new Error(`${typeName} must be a number, got ${typeof value}`);
  }
  return true;
}

/**
 * Validates that a value is a boolean
 */
export function validateBoolean(
  value: unknown,
  typeName: string
): value is boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`${typeName} must be a boolean, got ${typeof value}`);
  }
  return true;
} 