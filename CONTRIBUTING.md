# Contributing to Canton Node SDK

## Operation Patterns

The SDK uses two patterns for API operations. Choose the right pattern based on your use case:

### Factory Pattern (Preferred for REST)

Use `createApiOperation()` for standard REST endpoints with no special logic:

```typescript
// src/clients/ledger-json-api/operations/v2/version/get.ts
import { z } from 'zod';
import { createApiOperation } from '../../../../../core';

export const GetVersion = createApiOperation<void, GetVersionResponse>({
  paramsSchema: z.void(),
  method: 'GET',
  buildUrl: (_params: void, apiUrl: string) => `${apiUrl}/v2/version`,
});
```

**When to use:**
- Simple REST endpoints (GET, POST, DELETE, PATCH)
- No async logic needed before making the request
- No client method calls required (e.g., `getLedgerEnd()`)
- Response transformation is simple or not needed

**Benefits:**
- Concise and declarative
- Consistent structure across operations
- Auto-generates JSDoc from operation files

### Factory Pattern for WebSocket

Use `createWebSocketOperation()` for simple WebSocket subscriptions:

```typescript
// src/clients/ledger-json-api/operations/v2/commands/subscribe-to-completions.ts
import { createWebSocketOperation } from '../../../../../core/operations/WebSocketOperationFactory';

export const SubscribeToCompletions = createWebSocketOperation<Params, Request, Message>({
  paramsSchema: CompletionStreamRequestSchema,
  buildPath: (_params, _apiUrl) => '/v2/commands/completions',
  buildRequestMessage: (params, client) => ({
    userId: params.userId ?? client.getUserId(),
    parties: params.parties.length > 0 ? params.parties : client.buildPartyList(),
    beginExclusive: params.beginExclusive,
  }),
});
```

**When to use:**
- WebSocket endpoints with simple request/response patterns
- No complex state management needed
- Connection lifecycle is straightforward

**Note:** Factory-pattern WebSocket operations still require manual connection handling via the returned subscription object. Unlike REST operations (fire-and-forget), you must manage the subscription lifecycle:

```typescript
const subscription = await client.subscribeToCompletions(params, {
  onMessage: (msg) => console.log(msg),
  onError: (err) => console.error(err),
  onClose: () => console.log('Connection closed'),
});
// Later: subscription.close() to disconnect
```

### Class Pattern (For Complex Operations)

Use classes extending `ApiOperation` when you need:
- **Async pre-processing** (e.g., fetching defaults before the main request)
- **Client method calls** (e.g., `client.getLedgerEnd()`, `client.getPartyId()`)
- **Complex response aggregation** (e.g., pagination, streaming results)
- **WebSocket with state management** (e.g., connection lifecycle, error handling)

```typescript
// REST with async defaults
export class GetMemberTrafficStatus extends ApiOperation<Params, Response> {
  public async execute(params: Params): Promise<Response> {
    let { domainId } = params;
    if (!domainId) {
      // Needs async call to determine default
      domainId = await getCurrentMiningRoundDomainId(this.client);
    }
    // ... make request
  }
}

// WebSocket with complex lifecycle
export class SubscribeToUpdates {
  constructor(private readonly client: LedgerJsonApiClient) {}

  public async connect(params: Params): Promise<void> {
    // Fetch ledger end if not provided
    let { beginExclusive } = params;
    if (beginExclusive === undefined) {
      const ledgerEnd = await this.client.getLedgerEnd({});
      beginExclusive = ledgerEnd.offset;
    }
    // ... complex WebSocket handling
  }
}
```

**Current class-based operations:**
- `GetActiveContracts` — Uses WebSocket internally but exposes a simple async API; supports streaming callbacks and aggregates results until connection closes
- `SubscribeToUpdates` — Long-running WebSocket with complex message handling, error recovery, and async pre-processing to fetch `ledgerEnd` if not provided
- `GetMemberTrafficStatus` — Requires async call to `getCurrentMiningRoundDomainId()` before making the request when `domainId` is not provided
- `GetParties`/`ListParties` — Uses `fetchAllParties()` helper for automatic pagination across multiple API calls

### Decision Guide

| Scenario | Pattern |
|----------|---------|
| Simple REST GET/POST | Factory (`createApiOperation`) |
| REST with async defaults | Class extending `ApiOperation` |
| Simple WebSocket subscription | Factory (`createWebSocketOperation`) |
| WebSocket with streaming/callbacks | Class with `connect()` method |
| Pagination/aggregation | Class with custom `execute()` |

---

## Publishing

This package is automatically published via CI/CD when changes are pushed to the main branch. The
publishing workflow:

1. Runs on every push to the `main` branch
2. Automatically increments the patch version
3. Publishes to GitHub Packages
4. Creates a git tag for the release

**No manual publishing.**

### CI Configuration

The publishing workflow requires the following environment setup:

1. **GitHub Token**: The workflow uses `GITHUB_TOKEN` which is automatically provided by GitHub
   Actions
2. **Repository Permissions**: The workflow requires:
   - `contents: read` - to checkout code
   - `packages: write` - to publish to GitHub Packages

These permissions are configured in the workflow file and should not need manual setup.
