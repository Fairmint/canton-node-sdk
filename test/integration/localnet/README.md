# LocalNet Integration Tests

This directory contains integration tests that run against a local Canton network (LocalNet).

## Prerequisites

- LocalNet must be running (see main [README](../../../README.md) for setup instructions)
- Tests use the shared test clients defined in `../../setup.ts`

## Test Patterns

### Read-Only Operations

See `get-version.test.ts` for an example of testing read-only operations:

```typescript
import { testClients } from '../../setup';

describe('LocalNet GetVersion', () => {
  it('getVersion', async () => {
    const response = await testClients.ledgerJsonApi.getVersion();
    expect(response.version).toBeDefined();
  });
});
```

### Write Operations with Read-Back Verification

See `user-management.test.ts` for an example of testing write operations with read-back verification:

```typescript
import { testClients } from '../../setup';

describe('LocalNet User Management', () => {
  it('should create a user, retrieve it, and list users', async () => {
    // Create a unique user ID for this test
    const userId = `test-user-${Date.now()}`;

    // Write operation: Create a user
    const createResponse = await testClients.ledgerJsonApi.createUser({
      user: {
        id: userId,
        isDeactivated: false,
      },
    });

    // Verify creation response
    expect(createResponse.user?.id).toBe(userId);

    // Read-back verification: Get the specific user
    const getResponse = await testClients.ledgerJsonApi.getUser({ userId });
    expect(getResponse.user?.id).toBe(userId);

    // List verification: Confirm user appears in list
    const listResponse = await testClients.ledgerJsonApi.listUsers({});
    const foundUser = listResponse.users?.find((user) => user.id === userId);
    expect(foundUser).toBeDefined();
  });
});
```

## Running Tests

```bash
# Run all LocalNet integration tests
npm test -- test/integration/localnet

# Run a specific test file
npm test -- test/integration/localnet/user-management.test.ts
```

## Notes

- Tests will fail if LocalNet is not running
- Use unique identifiers (e.g., timestamp-based) for created entities to avoid conflicts
- Follow the existing patterns for consistency
