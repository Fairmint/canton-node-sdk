# End-to-End (E2E) Tests

This directory contains end-to-end tests for the Canton Node SDK running against a local Canton
network (LocalNet). These tests validate real API interactions with valid inputs and expected
outputs.

## Purpose

E2E tests serve multiple purposes:

1. **Validation**: Verify the SDK works correctly with real Canton services
2. **Documentation**: Demonstrate how to use SDK APIs with real examples
3. **Regression Testing**: Catch breaking changes during development
4. **PR Reviews**: Show expected behavior changes in pull requests

## Test Coverage

### Ledger JSON API

- **`version.e2e.ts`** - Tests the `getVersion()` API
  - Validates version format and structure
  - Checks feature flags (userManagement, etc.)
  - Demonstrates OAuth2 authentication flow

- **`packages.e2e.ts`** - Tests the `listPackages()` API
  - Validates package listing functionality
  - Checks package structure and metadata
  - Demonstrates data enumeration patterns

## Prerequisites

### 1. LocalNet Must Be Running

```bash
# Setup LocalNet (first time only)
npm run localnet:quickstart

# Start LocalNet
npm run localnet:start

# Check status
npm run localnet:status
```

### 2. Services Must Be Healthy

Wait for all services to be ready (usually 30-60 seconds after start).

## Running Tests

### Run All E2E Tests

```bash
npm run test:e2e
```

### Run a Specific Test

```bash
# Version API
tsx test/e2e/ledger-json-api/version.e2e.ts

# Packages API
tsx test/e2e/ledger-json-api/packages.e2e.ts
```

## Test Structure

### Test Files

Each test file (`*.e2e.ts`) is a standalone executable script that:

1. Creates a client using the test helpers
2. Runs multiple test cases
3. Reports results and exits with appropriate code

Example structure:

```typescript
import { E2ETestRunner, assert } from '../helpers/e2e-test-runner';
import { createLedgerJsonApiClient } from '../helpers/test-clients';

async function main(): Promise<void> {
  const runner = new E2ETestRunner('Test Suite Name');
  const client = createLedgerJsonApiClient();

  await runner.runTest('Test case 1', async () => {
    const response = await client.someMethod();
    assert.isDefined(response);
    assert.hasProperty(response, 'expectedField');
  });

  runner.printSummary();
  runner.exit();
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
```

### Helpers

- **`e2e-test-runner.ts`** - Test runner utilities and assertion helpers
- **`test-clients.ts`** - Pre-configured clients for localnet testing

### Test Runner Features

The `E2ETestRunner` class provides:

- **Test execution**: Run individual test cases with timing
- **Error handling**: Catch and report test failures
- **Result tracking**: Track pass/fail counts
- **Summary reporting**: Print test results summary

### Assertion Helpers

The `assert` object provides type-safe assertions:

```typescript
assert.isDefined(value); // Check value is not null/undefined
assert.isString(value); // Check value is a string
assert.isNumber(value); // Check value is a number
assert.isBoolean(value); // Check value is a boolean
assert.isArray(value); // Check value is an array
assert.hasProperty(obj, 'prop'); // Check object has property
assert.matches(str, /pattern/); // Check string matches regex
assert.equals(actual, expected); // Check equality
assert.greaterThan(value, min); // Check value > min
```

## Writing New Tests

### 1. Create Test File

Create a new file in the appropriate subdirectory:

```
test/e2e/ledger-json-api/my-api.e2e.ts
test/e2e/validator-api/my-api.e2e.ts
```

### 2. Use Test Template

```typescript
/**
 * E2E Test: API Name
 *
 * Description of what this test validates.
 */

import { E2ETestRunner, assert } from '../helpers/e2e-test-runner';
import { createLedgerJsonApiClient } from '../helpers/test-clients';

async function main(): Promise<void> {
  const runner = new E2ETestRunner('API Name');
  const client = createLedgerJsonApiClient();

  console.log('\n📋 E2E Test: API Name\n');

  // Test 1: Basic functionality
  await runner.runTest('Should do something', async () => {
    const response = await client.myMethod();
    assert.isDefined(response);
  });

  // Add more test cases...

  runner.printSummary();
  runner.exit();
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
```

### 3. Add to Test Suite

Update `run-all.ts` to include your new test:

```typescript
const testFiles: TestFile[] = [
  // ... existing tests
  {
    name: 'API Name',
    path: 'test/e2e/ledger-json-api/my-api.e2e.ts',
  },
];
```

### 4. Run and Verify

```bash
# Test your specific file
tsx test/e2e/ledger-json-api/my-api.e2e.ts

# Run full suite
npm run test:e2e
```

## Best Practices

### Focus on Happy Paths

E2E tests should focus on the **happy path** - valid inputs and expected outputs. These tests
demonstrate:

- How to use the API correctly
- What valid responses look like
- Expected data structures and types

### Keep Tests Simple

Each test should be easy to understand and maintain:

- Use descriptive test names
- Add comments for complex validations
- Log key information (e.g., version numbers, counts)
- Keep test cases focused and independent

### Validate Structure, Not Exact Values

Tests should validate:

- ✅ Response has expected fields
- ✅ Fields have correct types
- ✅ Values are in valid ranges
- ❌ Exact field values (these may vary)

Example:

```typescript
// Good: Validate type and range
assert.isString(response.version);
assert.matches(response.version, /^\d+\.\d+\.\d+/);

// Bad: Validate exact value (brittle)
assert.equals(response.version, '3.3.0-SNAPSHOT');
```

### Document Expected Responses

Include example responses in test documentation to help users understand the API:

````typescript
/**
 * ## Expected Response Structure
 *
 * ```json
 * {
 *   "version": "3.3.0-SNAPSHOT",
 *   "features": { ... }
 * }
 * ```
 */
````

## CI Integration

E2E tests run automatically in CI:

- **On every commit** - Tests run against LocalNet in CircleCI
- **In pull requests** - Results are reported in PR checks
- **Nightly** - Scheduled regression testing

See `.circleci/config.yml` for CI configuration.

## Troubleshooting

### Tests Fail with "Connection Refused"

**Cause**: LocalNet is not running or not ready.

**Fix**:

```bash
# Check if services are running
npm run localnet:status

# Restart if needed
npm run localnet:stop
npm run localnet:start
```

### Tests Fail with "Authentication Failed"

**Cause**: OAuth2 authentication is not working.

**Fix**:

```bash
# Verify Keycloak is accessible
curl http://localhost:8082/realms/AppProvider

# Check service logs
cd cn-quickstart/quickstart
make logs
```

### Tests Timeout

**Cause**: Services are slow to respond or overloaded.

**Fix**:

- Wait longer for services to fully start
- Check system resources (CPU, memory)
- Check Docker container health

## Examples

See the existing test files for complete examples:

- **Simple API**: `version.e2e.ts` - GET request with no parameters
- **List API**: `packages.e2e.ts` - GET request returning array data

These tests demonstrate the patterns and best practices for E2E testing in this SDK.
