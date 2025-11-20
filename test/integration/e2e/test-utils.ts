/**
 * End-to-End Test Utilities
 *
 * Provides utilities for lightweight e2e tests that serve as both tests and documentation.
 * Tests run against localnet and demonstrate API usage with full request/response examples.
 */

import { LedgerJsonApiClient, ValidatorApiClient } from '../../../src';

/**
 * Create a LedgerJsonApiClient configured for localnet testing
 */
export function createLedgerClient(): LedgerJsonApiClient {
  return new LedgerJsonApiClient({
    network: 'localnet',
  });
}

/**
 * Create a ValidatorApiClient configured for localnet testing
 */
export function createValidatorClient(): ValidatorApiClient {
  return new ValidatorApiClient({
    network: 'localnet',
  });
}

/**
 * Deep equality assertion for Jest
 * Fails if any attributes are missing or if values don't match
 */
export function expectDeepEqual<T>(actual: T, expected: T): void {
  expect(actual).toEqual(expected);
}

/**
 * Assert that a value matches the expected structure and values
 * This is a stricter version of toMatchObject that ensures no extra fields
 */
export function expectExactMatch<T>(actual: T, expected: T): void {
  // First check deep equality
  expect(actual).toEqual(expected);
  
  // Then verify no extra keys in objects
  if (typeof actual === 'object' && actual !== null && typeof expected === 'object' && expected !== null) {
    const actualKeys = Object.keys(actual).sort();
    const expectedKeys = Object.keys(expected).sort();
    expect(actualKeys).toEqual(expectedKeys);
  }
}
