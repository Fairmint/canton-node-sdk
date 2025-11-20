# End-to-End Test Framework

This directory contains end-to-end integration tests for the Ledger JSON API. These tests run against a live localnet instance and serve as both validation tests and documentation examples.

## Overview

The test framework focuses on **happy path** scenarios to:
- ✅ Validate API functionality against real services
- ✅ Demonstrate correct API usage patterns
- ✅ Communicate API changes during PR reviews
- ✅ Serve as living documentation

## Test Structure

```
test/integration/
├── helpers/
│   └── test-setup.ts          # Test utilities and client setup
└── ledger-json-api/
    ├── version.test.ts        # Version API tests
    ├── packages.test.ts       # Packages API tests
    └── README.md              # This file
```

## Running Tests

### Prerequisites

1. **Start Localnet:**
   ```bash
   npm run localnet:start
   ```

2. **Build SDK:**
   ```bash
   npm run build:core
   ```

### Run All E2E Tests

```bash
npm run test:e2e
```

### Run Specific Test File

```bash
# Run version tests only
jest test/integration/ledger-json-api/version.test.ts

# Run packages tests only
jest test/integration/ledger-json-api/packages.test.ts
```

### Run in Watch Mode

```bash
npm run test:watch -- test/integration/ledger-json-api
```

## Test Framework Features

### Simple Client Setup

The `createTestClient()` helper automatically configures a client for localnet:

```typescript
import { createTestClient } from '../helpers/test-setup';

const client = createTestClient();
// Client is ready to use with localnet defaults
```

### Clear Test Structure

Each test file follows a consistent pattern:

1. **Header Documentation** - Explains what the API does
2. **Example Usage** - Shows how to use the API
3. **Test Cases** - Validates happy path scenarios

### Focus on Happy Cases

Tests validate:
- ✅ Response structure and types
- ✅ Expected data presence
- ✅ Consistency across multiple calls
- ✅ Integration between related APIs

## Adding New Tests

### Step 1: Create Test File

Create a new test file in `test/integration/ledger-json-api/`:

```typescript
/**
 * End-to-End Tests: MyNewAPI
 *
 * **API Endpoint:** `GET /v2/my-endpoint`
 *
 * **What it does:**
 * - Brief description of what the API does
 *
 * **Example Usage:**
 * ```typescript
 * const client = new LedgerJsonApiClient({ network: 'localnet' });
 * const result = await client.myNewMethod();
 * ```
 */

import { createTestClient } from '../helpers/test-setup';
import type { MyNewApiResponse } from '../../../src/clients/ledger-json-api/schemas/api';

describe('MyNewAPI - End-to-End Tests', () => {
  const client = createTestClient();

  describe('myNewMethod()', () => {
    it('should return expected response', async () => {
      const response = await client.myNewMethod();
      
      expect(response).toBeDefined();
      // Add more assertions...
    }, 30000);
  });
});
```

### Step 2: Follow Best Practices

- **Use descriptive test names** - They serve as documentation
- **Include example code** - Shows how to use the API
- **Test happy paths** - Focus on valid inputs and outputs
- **Add timeouts** - Use 30000ms for API calls
- **Validate structure** - Check response shape and types
- **Test consistency** - Verify multiple calls return consistent results

### Step 3: Run and Verify

```bash
# Build first
npm run build:core

# Run your new test
jest test/integration/ledger-json-api/your-test.test.ts
```

## Test Coverage

### Currently Tested APIs

- ✅ **Version API** (`/v2/version`)
  - `getVersion()` - Get participant node version

- ✅ **Packages API** (`/v2/packages`)
  - `listPackages()` - List all packages
  - `getPackageStatus()` - Get package status

### Future APIs to Add

- Events API
- Updates API
- Users API
- Commands API

## CI Integration

These tests run automatically in CI when:
- Localnet is available
- Services are ready
- OAuth2 authentication is configured

The tests are designed to be fast and reliable, making them suitable for:
- ✅ Pull request validation
- ✅ Regression testing
- ✅ Documentation verification

## Troubleshooting

### Tests Fail with Connection Errors

**Cause:** Localnet is not running or not ready.

**Fix:**
```bash
# Check localnet status
npm run localnet:status

# Start localnet
npm run localnet:start

# Wait for services to be ready
# Then run tests again
npm run test:e2e
```

### Tests Fail with Authentication Errors

**Cause:** OAuth2 configuration is incorrect.

**Fix:** Ensure localnet is set up with OAuth2 enabled. The SDK's localnet defaults should handle this automatically.

### Tests Timeout

**Cause:** Services are slow to respond.

**Fix:** Increase timeout in test (default is 30000ms):
```typescript
it('should do something', async () => {
  // test code
}, 60000); // Increase timeout
```

## Best Practices

1. **Keep tests simple** - Focus on happy paths
2. **Document clearly** - Tests serve as documentation
3. **Use types** - Import response types from schemas
4. **Validate structure** - Check response shape
5. **Test consistency** - Verify multiple calls work
6. **Add examples** - Show how to use the API
