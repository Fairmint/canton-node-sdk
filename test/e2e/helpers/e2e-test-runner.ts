/**
 * E2E Test Runner Helper
 *
 * Provides utilities for running end-to-end tests against localnet. This helper simplifies test setup and provides
 * consistent patterns for validating API responses.
 */

/** Test result interface */
export interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
}

/** Test suite result interface */
export interface TestSuiteResult {
  suiteName: string;
  results: TestResult[];
  totalTests: number;
  passedTests: number;
  failedTests: number;
  totalDuration: number;
}

/** Base class for E2E test runners */
export class E2ETestRunner {
  private readonly results: TestResult[] = [];
  private readonly suiteName: string;

  constructor(suiteName: string) {
    this.suiteName = suiteName;
  }

  /** Run a single test */
  async runTest(testName: string, testFn: () => Promise<void>): Promise<void> {
    const startTime = Date.now();
    let passed = false;
    let error: string | undefined;

    try {
      await testFn();
      passed = true;
      console.log(`  ✓ ${testName}`);
    } catch (err) {
      passed = false;
      error = err instanceof Error ? err.message : String(err);
      console.log(`  ✗ ${testName}`);
      console.log(`    Error: ${error}`);
    }

    const duration = Date.now() - startTime;
    this.results.push({ name: testName, passed, duration, error });
  }

  /** Get test suite results */
  getResults(): TestSuiteResult {
    const passedTests = this.results.filter((r) => r.passed).length;
    const failedTests = this.results.filter((r) => !r.passed).length;
    const totalDuration = this.results.reduce((sum, r) => sum + r.duration, 0);

    return {
      suiteName: this.suiteName,
      results: this.results,
      totalTests: this.results.length,
      passedTests,
      failedTests,
      totalDuration,
    };
  }

  /** Print test summary */
  printSummary(): void {
    const results = this.getResults();
    console.log(`\n${results.suiteName}`);
    console.log(`Tests: ${results.totalTests}`);
    console.log(`Passed: ${results.passedTests}`);
    console.log(`Failed: ${results.failedTests}`);
    console.log(`Duration: ${results.totalDuration}ms`);
  }

  /** Exit with appropriate code */
  exit(): void {
    const results = this.getResults();
    process.exit(results.failedTests > 0 ? 1 : 0);
  }
}

/** Assert helper functions */
export const assert = {
  isDefined: <T>(value: T, message?: string): asserts value is NonNullable<T> => {
    if (value === undefined || value === null) {
      throw new Error(message ?? `Expected value to be defined, got ${String(value)}`);
    }
  },

  isString: (value: unknown, message?: string): asserts value is string => {
    if (typeof value !== 'string') {
      throw new Error(message ?? `Expected string, got ${typeof value}`);
    }
  },

  isNumber: (value: unknown, message?: string): asserts value is number => {
    if (typeof value !== 'number') {
      throw new Error(message ?? `Expected number, got ${typeof value}`);
    }
  },

  isBoolean: (value: unknown, message?: string): asserts value is boolean => {
    if (typeof value !== 'boolean') {
      throw new Error(message ?? `Expected boolean, got ${typeof value}`);
    }
  },

  isArray: (value: unknown, message?: string): asserts value is unknown[] => {
    if (!Array.isArray(value)) {
      throw new Error(message ?? `Expected array, got ${typeof value}`);
    }
  },

  hasProperty: <T extends object>(obj: T, prop: string, message?: string): void => {
    if (!(prop in obj)) {
      throw new Error(message ?? `Expected object to have property '${prop}'`);
    }
  },

  matches: (value: string, pattern: RegExp, message?: string): void => {
    if (!pattern.test(value)) {
      throw new Error(message ?? `Expected '${value}' to match pattern ${String(pattern)}`);
    }
  },

  equals: <T>(actual: T, expected: T, message?: string): void => {
    if (actual !== expected) {
      throw new Error(message ?? `Expected ${String(expected)}, got ${String(actual)}`);
    }
  },

  greaterThan: (value: number, min: number, message?: string): void => {
    if (value <= min) {
      throw new Error(message ?? `Expected ${value} to be greater than ${min}`);
    }
  },
};
