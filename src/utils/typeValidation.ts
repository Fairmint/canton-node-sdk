/**
 * Runtime type validation utilities
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
