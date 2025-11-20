# End-to-End Tests

Lightweight end-to-end tests that serve as both validation and documentation.

## Purpose

These tests demonstrate API usage with full request/response examples. They run against localnet and focus on happy-path scenarios, making them:

- **Documentation**: Clear examples of how to use each API
- **Validation**: Ensure APIs work correctly  
- **PR Reviews**: Show API changes clearly in test diffs

## Running Tests

```bash
# Run all e2e tests (requires localnet)
npm run test:e2e

# Run specific test file
npm test test/integration/e2e/ledger-json-api-version.test.ts
```

## Test Structure

Each test follows this pattern:

```typescript
it("apiMethod()", async () => {
  const result = await client.apiMethod();
  
  // Deep equality assertion showing full response structure
  expect(result).toEqual({
    field1: "value",
    field2: 123
  });
});
```

## Prerequisites

- Localnet must be running (`npm run localnet:start`)
- Default localnet configuration is used automatically

## Test Files

- `ledger-json-api-version.test.ts` - Version endpoint
- `ledger-json-api-packages.test.ts` - Package listing
- `ledger-json-api-state.test.ts` - State queries (ledger end, synchronizers, etc.)

## Adding New Tests

1. Create a new test file following the naming pattern: `{client}-{feature}.test.ts`
2. Import test utilities from `./test-utils`
3. Focus on happy-path scenarios
4. Use deep equality assertions to document full response structure
5. Add comments explaining what the test demonstrates
