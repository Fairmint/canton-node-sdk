/** Type guard to check if a value is a non-null object (record) */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Type guard to check if a value is a non-empty string */
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

/** Type guard to check if a value is an array */
export function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

/** Type guard to check if a value is an array of strings */
export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

/** Type guard to check if a value is a boolean */
export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

/** Type guard to check if a value is null or undefined */
export function isNullish(value: unknown): value is null | undefined {
  return value === null || value === undefined;
}

/** Type guard to check if a value is defined (not null or undefined) */
export function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

/**
 * Type guard to check if a record has a specific property with the expected type. Uses a type predicate callback for
 * the property value.
 */
export function hasProperty<K extends string, V>(
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

/** Type guard to check if a record has a number property. */
export function hasNumberProperty<K extends string>(obj: unknown, key: K): obj is Record<K, number> {
  return hasProperty(obj, key, isNumber);
}

/** Safely extract a string from an unknown value. */
export function extractString(value: unknown): string | undefined {
  return isString(value) ? value : undefined;
}

/** Safely extract a number from an unknown value. */
export function extractNumber(value: unknown): number | undefined {
  return isNumber(value) ? value : undefined;
}
