/**
 * Shape validation utilities
 */

/**
 * Validates that a value is a valid Record with specific value types
 */
export function validateRecord<
  T extends Record<string, string | number | boolean | null>,
>(value: unknown, typeName: string): value is T {
  if (typeof value !== 'object' || value === null) {
    throw new Error(`${typeName} must be an object, got ${typeof value}`);
  }

  const obj = value as Record<string, unknown>;

  // Check each value in the record
  for (const [key, val] of Object.entries(obj)) {
    if (
      val !== null &&
      typeof val !== 'string' &&
      typeof val !== 'number' &&
      typeof val !== 'boolean'
    ) {
      throw new Error(
        `${typeName}.${key} must be a string, number, boolean, or null, got ${typeof val}`
      );
    }
  }

  return true;
}

/**
 * Validates that an object has exactly the expected properties and no extra ones
 */
export function validateExactShape<T extends Record<string, unknown>>(
  obj: unknown,
  expectedShape: Record<keyof T, 'required' | 'optional'>,
  typeName: string
): obj is T {
  if (typeof obj !== 'object' || obj === null) {
    throw new Error(`${typeName} must be an object, got ${typeof obj}`);
  }

  const actualKeys = Object.keys(obj as Record<string, unknown>);
  const expectedKeys = Object.keys(expectedShape);

  // Check for missing required properties
  const missingRequired = expectedKeys.filter(
    key => expectedShape[key as keyof T] === 'required' && !(key in obj)
  );

  if (missingRequired.length > 0) {
    throw new Error(
      `${typeName} is missing required properties: ${missingRequired.join(', ')}`
    );
  }

  // Check for extra properties
  const extraKeys = actualKeys.filter(key => !expectedKeys.includes(key));

  if (extraKeys.length > 0) {
    throw new Error(
      `${typeName} has unexpected properties: ${extraKeys.join(', ')}`
    );
  }

  return true;
}

/**
 * Validates that an object has the expected properties (allows extra properties)
 */
export function validateShape<T extends Record<string, unknown>>(
  obj: unknown,
  expectedShape: Record<keyof T, 'required' | 'optional'>,
  typeName: string
): obj is T {
  if (typeof obj !== 'object' || obj === null) {
    throw new Error(`${typeName} must be an object, got ${typeof obj}`);
  }

  const expectedKeys = Object.keys(expectedShape);

  // Check for missing required properties
  const missingRequired = expectedKeys.filter(
    key => expectedShape[key as keyof T] === 'required' && !(key in obj)
  );

  if (missingRequired.length > 0) {
    throw new Error(
      `${typeName} is missing required properties: ${missingRequired.join(', ')}`
    );
  }

  return true;
} 