# Refactoring and Testing Plan

This document outlines potential refactoring, improvements, and testing opportunities for the Canton Node SDK.

## Executive Summary

The SDK has a solid foundation with good architecture patterns (BaseClient, ApiOperation factory, code generation). However, it lacks comprehensive testing and has opportunities for API ergonomics improvements. With LocalNet available, we can now add thorough integration tests and refactor utilities to be more user-friendly.

---

## 1. Testing Improvements (High Priority)

### Current State

Only 3 test files exist:
- `test/unit/amulet/select-funding-amulets.test.ts` - Single utility function test
- `test/unit/utils/EnvLoader.test.ts` - Configuration loader tests
- `test/integration/localnet/get-version.test.ts` - Mock server test (not true integration)

### 1.1 Add True LocalNet Integration Tests

**Goal**: Test actual SDK operations against a running LocalNet instance.

```typescript
// test/integration/localnet/ledger-api.test.ts
describe('LedgerJsonApiClient Integration', () => {
  it('creates a party and submits a transaction', async () => {
    // Real end-to-end test
  });
});
```

**Tests to add:**
- [ ] `ledger-json-api/` - Party management, user management, commands, transactions
- [ ] `validator-api/` - Wallet operations, transfer offers, balance queries
- [ ] `scan-api/` - Read operations, contract lookups
- [ ] `websocket/` - Updates subscription, completion streaming

### 1.2 Add Unit Tests for Utility Functions

**Untested utilities that need coverage:**

| Utility | File | Priority |
|---------|------|----------|
| `createParty` | `src/utils/party/createParty.ts` | High |
| `createTransferOffer` | `src/utils/amulet/offers.ts` | High |
| `acceptTransferOffer` | `src/utils/amulet/offers.ts` | High |
| `transferToPreapproved` | `src/utils/amulet/transfer-to-preapproved.ts` | High |
| `preApproveTransfers` | `src/utils/amulet/pre-approve-transfers.ts` | High |
| `getAmuletsForTransfer` | `src/utils/amulet/get-amulets-for-transfer.ts` | Medium |
| `getLockedAmulets` | `src/utils/amulet/get-locked-amulets.ts` | Medium |
| `createExternalParty` | `src/utils/external-signing/create-external-party.ts` | High |
| `prepareExternalTransaction` | `src/utils/external-signing/prepare-external-transaction.ts` | High |
| `executeExternalTransaction` | `src/utils/external-signing/execute-external-transaction.ts` | High |
| `getCurrentMiningRoundContext` | `src/utils/mining/mining-rounds.ts` | Medium |
| `findCreatedEventByTemplateId` | `src/utils/contracts/findCreatedEvent.ts` | Medium |
| `TransactionBatch` | `src/utils/transactions/TransactionBatch.ts` | Medium |

### 1.3 Add Schema Validation Tests

Test that Zod schemas correctly validate API responses:

```typescript
// test/unit/schemas/commands.test.ts
describe('Command Schemas', () => {
  it('validates CreateCommand structure', () => {
    const result = CreateCommandSchema.safeParse({ /* ... */ });
    expect(result.success).toBe(true);
  });
});
```

### 1.4 Add Error Handling Tests

Test error scenarios and edge cases:
- Network failures and retries
- Authentication errors
- API error responses
- Validation failures

---

## 2. API Ergonomics Improvements (Medium Priority)

### 2.1 Simplify Common Workflows

**Current (verbose):**
```typescript
const ledgerClient = new LedgerJsonApiClient({ network: 'localnet' });
const validatorClient = new ValidatorApiClient({ network: 'localnet' });

const transferOfferContractId = await createTransferOffer({
  ledgerClient,
  receiverPartyId: 'recipient',
  amount: '100',
  description: 'Payment',
});

await acceptTransferOffer({
  ledgerClient,
  transferOfferContractId,
  acceptingPartyId: 'recipient',
});
```

**Proposed (fluent):**
```typescript
import { Canton } from '@fairmint/canton-node-sdk';

const canton = new Canton({ network: 'localnet' });

// Unified client access
await canton.transfers.send({
  to: 'recipient',
  amount: '100',
  description: 'Payment',
});

// Or fluent builder
await canton.transfer('100')
  .to('recipient')
  .withDescription('Payment')
  .send();
```

### 2.2 Add High-Level Facade

Create a unified entry point that abstracts away the multiple clients:

```typescript
// src/Canton.ts (proposed)
export class Canton {
  public readonly ledger: LedgerJsonApiClient;
  public readonly validator: ValidatorApiClient;
  public readonly scan: ScanApiClient;
  
  // High-level operations
  public readonly parties: PartyOperations;
  public readonly transfers: TransferOperations;
  public readonly contracts: ContractOperations;
  
  constructor(config: CantonConfig) {
    // Initialize all clients with shared config
  }
}
```

### 2.3 Improve TransactionBatch API

**Current:**
```typescript
const batch = new TransactionBatch(client, actAs);
batch.addCommand(command);
await batch.submitAndWait();
```

**Proposed:**
```typescript
const batch = client.batch(actAs)
  .create(templateId, args)
  .exercise(contractId, choice, args)
  .exercise(contractId2, choice2, args2);

const result = await batch.submit();
```

### 2.4 Add Command Builders

Simplify command construction:

```typescript
// Current (verbose)
const command: ExerciseCommand = {
  ExerciseCommand: {
    templateId: '#splice-amulet:Splice.AmuletRules:TransferPreapproval',
    contractId: preapprovalContractId,
    choice: 'TransferPreapproval_Send',
    choiceArgument: { /* complex nested object */ },
  },
};

// Proposed (builder)
import { Commands } from '@fairmint/canton-node-sdk';

const command = Commands.exercise('TransferPreapproval')
  .on(preapprovalContractId)
  .choice('TransferPreapproval_Send')
  .with({ amount: '100', sender: partyId })
  .build();
```

---

## 3. Code Quality Improvements (Medium Priority)

### 3.1 Remove Hardcoded Waits

**Problem:** Several utilities use hardcoded `setTimeout`:

```typescript
// src/utils/party/createParty.ts:66
await new Promise((resolve) => setTimeout(resolve, 30000));
```

**Solution:** Replace with polling/retry utilities:

```typescript
// src/core/utils/polling.ts
export async function waitForCondition<T>(
  check: () => Promise<T | null>,
  options: { timeout: number; interval: number }
): Promise<T> {
  // Poll until condition is met or timeout
}

// Usage
await waitForCondition(
  () => client.getContractById(contractId),
  { timeout: 30000, interval: 1000 }
);
```

### 3.2 Improve Type Safety

**Problem:** Some places use `unknown` with type assertions:

```typescript
// src/core/operations/ApiOperationFactory.ts:36
const data = await config.buildRequestData?.(validatedParams, this.client);
```

**Solution:** Add proper generics and constraints to eliminate assertions.

### 3.3 Standardize Error Messages

Create consistent error message patterns:

```typescript
// Current (inconsistent)
throw new Error(`No domain ID found for transfer preapproval for party ${partyId}`);
throw new Error('No valid open mining round found');

// Proposed (structured)
throw new CantonError(
  'No domain ID found for transfer preapproval',
  'MISSING_DOMAIN_ID',
  { partyId }
);
```

### 3.4 Add Request/Response Logging Middleware

Improve debugging with structured logging:

```typescript
// Enable debug logging
const canton = new Canton({
  network: 'localnet',
  debug: true, // Logs all requests/responses
});
```

---

## 4. Architecture Improvements (Lower Priority)

### 4.1 Consolidate Operation Patterns

**Current:** Mix of class-based and factory-based operations:

```typescript
// Factory pattern (newer)
export const GetVersion = createApiOperation<...>({ ... });

// Class pattern (older)
export class SubscribeToUpdates {
  public async connect(params) { ... }
}
```

**Recommendation:** Standardize on factory pattern for REST, keep classes for WebSocket.

### 4.2 Improve Code Generation

The `generate-all-client-methods.ts` script could be improved:

- Add JSDoc comments to generated methods
- Generate parameter type exports for better autocomplete
- Generate response type exports

### 4.3 Add Response Transformers

Normalize API responses to consistent shapes:

```typescript
// Raw API response
{ party_id: 'alice::123', user_name: 'alice' }

// Transformed to camelCase
{ partyId: 'alice::123', userName: 'alice' }
```

### 4.4 Simplify Configuration

The `EnvLoader` class is complex (480 lines). Consider:

- Split into smaller focused loaders
- Add configuration validation on startup
- Support configuration files (JSON/YAML)

---

## 5. Documentation Improvements (Lower Priority)

### 5.1 Add JSDoc to All Public APIs

Currently inconsistent documentation. Every public method should have:
- Description
- Parameter documentation
- Return type documentation
- Example usage

### 5.2 Add More Examples

Current examples are minimal. Add:
- `examples/create-party.ts`
- `examples/transfer-amulets.ts`
- `examples/subscribe-to-updates.ts`
- `examples/external-signing-flow.ts`
- `examples/batch-transactions.ts`

### 5.3 Add Troubleshooting Guide

Document common errors and solutions.

---

## 6. Implementation Priority

### Phase 1: Testing Foundation (1-2 weeks)
1. Add LocalNet integration test infrastructure
2. Add tests for core utility functions
3. Add error handling tests

### Phase 2: API Ergonomics (2-3 weeks)
1. Add high-level `Canton` facade
2. Add command builders
3. Improve TransactionBatch API

### Phase 3: Code Quality (1-2 weeks)
1. Remove hardcoded waits
2. Standardize error messages
3. Add request/response logging

### Phase 4: Architecture & Docs (ongoing)
1. Consolidate operation patterns
2. Improve code generation
3. Add comprehensive JSDoc
4. Add examples

---

## 7. Testing Infrastructure Recommendations

### 7.1 Test Utilities

Create reusable test helpers:

```typescript
// test/helpers/localnet.ts
export async function withLocalNetClient<T>(
  fn: (clients: { ledger: LedgerJsonApiClient; validator: ValidatorApiClient }) => Promise<T>
): Promise<T> {
  const ledger = new LedgerJsonApiClient({ network: 'localnet' });
  const validator = new ValidatorApiClient({ network: 'localnet' });
  
  try {
    return await fn({ ledger, validator });
  } finally {
    // Cleanup if needed
  }
}

// test/helpers/fixtures.ts
export function createTestParty(name: string): PartyFixture {
  // Create deterministic test data
}
```

### 7.2 Test Categories

Organize tests by type:

```
test/
  unit/           # Fast, no external dependencies
  integration/    # Requires LocalNet
  e2e/           # Full workflow tests
```

### 7.3 CI Integration

Ensure all test types run in CI:

```yaml
# .github/workflows/test.yml
jobs:
  unit:
    runs-on: ubuntu-latest
    steps:
      - run: npm run test:unit
      
  integration:
    runs-on: ubuntu-latest
    services:
      localnet: ...
    steps:
      - run: npm run test:integration
```

---

## Appendix: Files Requiring Attention

### High Priority (need tests + refactoring)
- `src/utils/party/createParty.ts` - Hardcoded wait, no tests
- `src/utils/amulet/transfer-to-preapproved.ts` - Complex, no tests
- `src/utils/external-signing/*.ts` - Critical flow, no tests

### Medium Priority (need tests)
- `src/utils/amulet/offers.ts`
- `src/utils/amulet/pre-approve-transfers.ts`
- `src/utils/mining/mining-rounds.ts`
- `src/core/http/HttpClient.ts` - Retry logic untested

### Lower Priority (improve ergonomics)
- `src/core/BaseClient.ts` - Could be simplified
- `src/core/config/EnvLoader.ts` - Too complex
- `src/clients/ledger-json-api/operations/` - JSDoc improvements
