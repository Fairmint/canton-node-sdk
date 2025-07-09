/**
 * Array validation utilities
 */

/**
 * Validates that a value is an array and not of unknown or any type
 */
export function validateArray<T>(
  value: unknown,
  typeName: string,
  elementType?: string
): value is T[] {
  if (!Array.isArray(value)) {
    throw new Error(`${typeName} must be an array, got ${typeof value}`);
  }

  // Check if the array type contains unknown or any
  if (
    elementType &&
    (elementType.includes('unknown') || elementType.includes('any'))
  ) {
    throw new Error(
      `${typeName} cannot contain elements of type '${elementType}'`
    );
  }

  return true;
} 