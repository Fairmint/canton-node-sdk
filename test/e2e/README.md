# End-to-End Tests

End-to-end tests for the Canton Node SDK against a running localnet instance.

## Overview

These tests validate the SDK's integration with real Canton services running in localnet. They serve multiple purposes:

1. **Integration Testing**: Verify the SDK works correctly with actual Canton services
2. **Documentation**: Demonstrate how to use the SDK with real-world examples
3. **Regression Testing**: Catch breaking changes during PR reviews

## Prerequisites

### LocalNet Setup

The e2e tests require a running localnet instance with OAuth2 authentication:

```bash
# Start localnet (if not already running)
npm run localnet:start

# Check localnet status
npm run localnet:status
```

### No Environment Configuration Needed

The tests use the SDK's built-in localnet defaults:
- Network: `localnet`
- Provider: `app-provider`
- OAuth2 credentials: default localnet values

## Running Tests

```bash
# Run all e2e tests
npm run test:e2e

# Run a specific test file
npm run test:e2e -- version.e2e.test.ts

# Run in watch mode for development
npm run test:e2e:watch
```

## Test Organization

```
test/e2e/
├── helpers/              # Shared test utilities
│   ├── localnet-client.ts   # Pre-configured clients
│   ├── test-utils.ts        # Retry, timeout, assertions
│   └── index.ts             # Exports
├── ledger-json-api/      # Ledger JSON API tests
│   ├── version.e2e.test.ts
│   ├── packages.e2e.test.ts
│   └── ...
└── validator-api/        # Validator API tests (future)
    └── ...
```

## Writing E2E Tests

### Test Structure

E2E tests follow these conventions:

1. **File Naming**: `*.e2e.test.ts`
2. **Focus on Happy Paths**: Test valid inputs and expected outputs
3. **Self-Documenting**: Include detailed comments explaining the API and usage
4. **Type Safety**: Leverage TypeScript to ensure type correctness

### Example Test

```typescript
import { createLocalnetLedgerClient, TIMEOUTS } from '../helpers';

describe('E2E: My API Test', () => {
  const client = createLocalnetLedgerClient();

  it('should demonstrate the API', async () => {
    const response = await client.myApiCall();
    
    // Assert expected structure
    expect(response).toBeDefined();
    expect(response.someField).toBe('expected value');
    
    // Log for documentation purposes
    console.log('✅ Result:', response);
  }, TIMEOUTS.STANDARD);
});
```

### Best Practices

1. **Use Helpers**: Import pre-configured clients from `helpers/`
2. **Set Timeouts**: Use `TIMEOUTS` constants for appropriate timeouts
3. **Document APIs**: Include JSDoc comments explaining what the API does
4. **Log Results**: Use `console.log()` to show example outputs
5. **Validate Types**: Assert both runtime values and compile-time types
6. **Test Idempotency**: Verify APIs return consistent results

## Test Categories

### Ledger JSON API

Tests for the Ledger JSON API (`/v2/*` endpoints):

- `version.e2e.test.ts` - Version information and feature flags
- `packages.e2e.test.ts` - Package listing and metadata

### Validator API

Tests for the Validator API (future):

- User status and wallet information
- Party management
- Transaction operations

## CI/CD Integration

These tests are designed to run in CI with localnet:

```yaml
- name: Start LocalNet
  run: npm run localnet:start

- name: Run E2E Tests
  run: npm run test:e2e
```

## Troubleshooting

### Tests Timeout

If tests timeout, verify localnet is running:

```bash
npm run localnet:status
```

### Connection Refused

If you see `ECONNREFUSED`, ensure localnet services are available:

- Ledger JSON API: http://localhost:3975
- Validator API: http://localhost:3903
- OAuth2 Server: http://localhost:8082

### Authentication Errors

The tests use default localnet OAuth2 credentials. If you've customized your localnet, you may need to update environment variables.

## Adding New Tests

When adding new e2e tests:

1. Choose the appropriate directory (`ledger-json-api/` or `validator-api/`)
2. Name the file after the API endpoint (e.g., `users.e2e.test.ts`)
3. Include comprehensive JSDoc comments
4. Test happy paths with valid data
5. Add console logs for documentation
6. Update this README if needed
