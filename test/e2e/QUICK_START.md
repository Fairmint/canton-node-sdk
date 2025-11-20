# E2E Tests Quick Start

Quick reference for running and writing E2E tests.

## Running Tests

```bash
# Start LocalNet first
npm run localnet:start

# Run all E2E tests
npm run test:e2e

# Run specific test
npx tsx test/e2e/ledger-json-api/version.e2e.ts
npx tsx test/e2e/ledger-json-api/packages.e2e.ts
```

## Writing a New Test

### 1. Create Test File

```typescript
// test/e2e/ledger-json-api/my-api.e2e.ts
import { E2ETestRunner, assert } from '../helpers/e2e-test-runner';
import { createLedgerJsonApiClient } from '../helpers/test-clients';

async function main(): Promise<void> {
  const runner = new E2ETestRunner('My API Test');
  const client = createLedgerJsonApiClient();

  console.log('\n🧪 E2E Test: My API\n');

  // Test 1
  await runner.runTest('Should call API successfully', async () => {
    const response = await client.myMethod();
    assert.isDefined(response);
    assert.hasProperty(response, 'expectedField');
  });

  // More tests...

  runner.printSummary();
  runner.exit();
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
```

### 2. Add to Test Suite

Update `test/e2e/run-all.ts`:

```typescript
const testFiles: TestFile[] = [
  // ... existing tests
  {
    name: 'My API Test',
    path: 'test/e2e/ledger-json-api/my-api.e2e.ts',
  },
];
```

### 3. Test It

```bash
# Test specific file
npx tsx test/e2e/ledger-json-api/my-api.e2e.ts

# Run full suite
npm run test:e2e
```

## Available Assertions

```typescript
// Check existence
assert.isDefined(value);

// Check types
assert.isString(value);
assert.isNumber(value);
assert.isBoolean(value);
assert.isArray(value);

// Check properties
assert.hasProperty(obj, 'propName');

// Check values
assert.equals(actual, expected);
assert.greaterThan(value, min);
assert.matches(str, /pattern/);
```

## Tips

- **Focus on happy paths** - Test valid inputs and expected outputs
- **Validate structure** - Check types and properties, not exact values
- **Log useful info** - Help users understand what's being tested
- **Keep tests simple** - Each test should be easy to understand
- **Document examples** - Include sample responses in comments

## Example Output

```
🧪 E2E Test: Ledger JSON API - Get Version

Testing endpoint: GET /v2/version
Network: localnet
Provider: app-provider

  ✓ Should successfully call getVersion()
  ✓ Should return version field
    Version: 3.3.0-SNAPSHOT
  ✓ Should return valid version format
  ✓ Should return features object
  ✓ Should include userManagement feature
  ✓ Should have valid userManagement structure
    userManagement.supported: true

Ledger JSON API - Get Version
Tests: 10
Passed: 10
Failed: 0
Duration: 523ms
```

## Common Issues

### "Connection Refused"

LocalNet is not running:

```bash
npm run localnet:start
```

### "Authentication Failed"

Wait for services to be ready:

```bash
npm run localnet:status
sleep 30
```

## More Information

- **Full Guide**: [README.md](./README.md)
- **LocalNet Setup**: [../docs/LOCALNET_TESTING.md](../../docs/LOCALNET_TESTING.md)
- **Main README**: [../../README.md](../../README.md)
