/** Type guard to check if a value is a non-null object (record) */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Type guard to check if a value is a non-empty string (whitespace-only strings return false). */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Type guard to check if a value is a string */
export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

/** Type guard to check if a value is a number (excludes NaN) */
export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !Number.isNaN(value);
}

/**
 * Type guard to check if a record has a specific property with the expected type. Uses a type predicate callback for
 * the property value.
 */
function hasProperty<K extends string, V>(
  obj: unknown,
  key: K,
  guard: (value: unknown) => value is V
): obj is Record<K, V> {
  return isRecord(obj) && key in obj && guard(obj[key]);
}

/** Type guard to check if a record has a string property. */
export function hasStringProperty<K extends string>(obj: unknown, key: K): obj is Record<K, string> {
  return hasProperty(obj, key, isString);
}

/** Safely extract a string from an unknown value. */
export function extractString(value: unknown): string | undefined {
  return isString(value) ? value : undefined;
}
