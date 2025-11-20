/**
 * Simple assertion helper for end-to-end tests
 *
 * Provides a clean API for deep equality assertions that show the full expected output.
 * This makes tests act as documentation and clearly demonstrate API responses.
 */

export class AssertionError extends Error {
  constructor(
    public readonly actual: unknown,
    public readonly expected: unknown,
    message?: string,
  ) {
    super(message || 'Assertion failed: values are not deeply equal');
    this.name = 'AssertionError';
  }
}

/**
 * Assert helper that provides a fluent API for deep equality checks
 *
 * @example
 * ```typescript
 * const result = await client.getVersion();
 * assert(result).eq({
 *   version: "3.0",
 *   features: { userManagement: { supported: true } }
 * });
 * ```
 */
export function assert<T>(actual: T): {
  eq(expected: T): void;
} {
  return {
    eq(expected: T): void {
      if (!deepEqual(actual, expected)) {
        throw new AssertionError(
          actual,
          expected,
          `Expected values to be deeply equal.\nActual: ${JSON.stringify(actual, null, 2)}\nExpected: ${JSON.stringify(expected, null, 2)}`,
        );
      }
    },
  };
}

/**
 * Deep equality check that handles objects, arrays, primitives, and null/undefined
 */
function deepEqual(a: unknown, b: unknown): boolean {
  // Same reference or both null/undefined
  if (a === b) {
    return true;
  }

  // One is null/undefined but not both
  if (a == null || b == null) {
    return false;
  }

  // Type mismatch
  if (typeof a !== typeof b) {
    return false;
  }

  // Primitive types (string, number, boolean)
  if (typeof a !== 'object') {
    return a === b;
  }

  // Arrays
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      return false;
    }
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) {
        return false;
      }
    }
    return true;
  }

  // One is array but not both
  if (Array.isArray(a) || Array.isArray(b)) {
    return false;
  }

  // Objects
  const keysA = Object.keys(a as Record<string, unknown>);
  const keysB = Object.keys(b as Record<string, unknown>);

  if (keysA.length !== keysB.length) {
    return false;
  }

  for (const key of keysA) {
    if (!keysB.includes(key)) {
      return false;
    }
    if (!deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) {
      return false;
    }
  }

  return true;
}
