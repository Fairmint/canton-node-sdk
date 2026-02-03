---
layout: default
title: Ledger API Protocol Buffers Reference
sdk_version: 0.0.127
---

# Ledger API Protocol Buffers

The Canton Ledger API is defined using [Protocol Buffers](https://protobuf.dev/) (protobufs), which serve as the canonical specification for the API. This SDK implements TypeScript clients for both the gRPC and JSON API interfaces.

## Choosing the Right API

Canton exposes the Ledger API through two interfaces. Choose based on your use case:

### When to Use gRPC (`LedgerGrpcClient`)

**Best for:**
- **High-frequency polling** - Monitoring ledger state for new transactions
- **Internal microservices** - Service-to-service communication where performance matters
- **Low-latency requirements** - Trading systems, real-time analytics
- **High-throughput batch operations** - Bulk data processing
- **Streaming subscriptions** - Real-time transaction feeds (future enhancement)

**Benefits:**
- Lower latency (binary protocol, no JSON parsing overhead)
- Smaller message sizes (protobuf encoding is ~30-50% smaller than JSON)
- Strong typing directly from protobuf definitions
- Native streaming support for subscriptions
- Better connection multiplexing

**Trade-offs:**
- Requires gRPC infrastructure knowledge
- More complex debugging (binary protocol)
- Requires proto files for code generation

### When to Use JSON API (`LedgerJsonApiClient`)

**Best for:**
- **Web applications** - Browser-based clients (gRPC requires proxies)
- **External integrations** - Third-party systems that prefer REST
- **Rapid prototyping** - Faster development with human-readable payloads
- **Debugging and testing** - Easy to inspect with standard HTTP tools
- **Simpler deployments** - Standard HTTP/WebSocket infrastructure

**Benefits:**
- Human-readable request/response format
- Works directly in browsers with WebSocket
- Easier debugging with curl, Postman, etc.
- Standard REST patterns familiar to most developers
- Well-documented with OpenAPI specs

**Trade-offs:**
- Higher latency than gRPC
- Larger message sizes (JSON encoding)
- JSON parsing overhead

### Quick Decision Guide

| Scenario | Recommended API |
|----------|-----------------|
| Monitoring dashboard | JSON API (ease of development) |
| High-frequency health checks | gRPC (low latency) |
| Transaction polling service | gRPC (efficiency at scale) |
| Web frontend | JSON API (browser compatibility) |
| Mobile app | JSON API (simpler integration) |
| Internal trading engine | gRPC (performance critical) |
| Analytics pipeline | gRPC (high throughput) |
| Integration with external system | JSON API (standard REST) |

## Using the gRPC Client

```typescript
import { LedgerGrpcClient, Values, createCreateCommand } from '@fairmint/canton-node-sdk';

// Create a gRPC client
const client = new LedgerGrpcClient({
  endpoint: 'localhost:3901',    // gRPC port (not JSON API port)
  accessToken: 'your-token',
  useTls: false,                 // Set to true for production
  timeoutMs: 30000,
});

// Get version (connectivity check)
const version = await client.getVersion();
console.log(`Ledger API version: ${version.version}`);

// Get ledger end (for monitoring)
const offset = await client.getLedgerEnd();
console.log(`Current ledger offset: ${offset}`);

// Submit a command
const result = await client.submitAndWait({
  userId: 'alice',
  commandId: crypto.randomUUID(),
  actAs: ['Alice::1234'],
  commands: [
    createCreateCommand(
      { packageId: 'pkg', moduleName: 'Main', entityName: 'Asset' },
      { fields: [{ label: 'owner', value: Values.party('Alice::1234') }] }
    ),
  ],
});
console.log(`Transaction: ${result.updateId}`);

// Always close when done
client.close();
```

## Using the JSON API Client

```typescript
import { LedgerJsonApiClient, EnvLoader } from '@fairmint/canton-node-sdk';

// Create a JSON API client
const config = EnvLoader.getConfig('LEDGER_JSON_API', {
  network: 'localnet',
  provider: 'app-provider',
});
const client = new LedgerJsonApiClient(config);

// Get version
const version = await client.getVersion();
console.log(`Ledger API version: ${version.version}`);

// Get ledger end
const { offset } = await client.getLedgerEnd();
console.log(`Current ledger offset: ${offset}`);
```

## Real-World Use Cases

### Use Case 1: Health Check Service

A service that monitors ledger connectivity for alerting systems.

```typescript
async function healthCheck(): Promise<HealthStatus> {
  const client = new LedgerGrpcClient({ endpoint: 'localhost:3901' });
  
  try {
    const version = await client.getVersion();
    const offset = await client.getLedgerEnd();
    
    return {
      healthy: true,
      version: version.version,
      ledgerOffset: offset,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      healthy: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    };
  } finally {
    client.close();
  }
}
```

### Use Case 2: Transaction Monitor

A service that polls for new transactions using high-frequency ledger end checks.

```typescript
class TransactionMonitor {
  private client: LedgerGrpcClient;
  private lastOffset: number = 0;

  constructor(endpoint: string, token: string) {
    this.client = new LedgerGrpcClient({
      endpoint,
      accessToken: token,
      timeoutMs: 5000,
    });
  }

  async poll(): Promise<number> {
    const currentOffset = await this.client.getLedgerEnd();
    const newTransactions = currentOffset - this.lastOffset;
    this.lastOffset = currentOffset;
    return newTransactions;
  }

  async startMonitoring(intervalMs: number): Promise<void> {
    setInterval(async () => {
      const newTxns = await this.poll();
      if (newTxns > 0) {
        console.log(`${newTxns} new transaction(s) detected`);
      }
    }, intervalMs);
  }
}
```

### Use Case 3: Multi-API Architecture

Use both APIs based on the specific requirements of each service.

```typescript
// Internal high-throughput service uses gRPC
const grpcClient = new LedgerGrpcClient({
  endpoint: 'ledger-grpc.internal:3901',
  accessToken: internalToken,
});

// External-facing API gateway uses JSON API
const jsonClient = new LedgerJsonApiClient({
  network: 'mainnet',
  provider: 'production',
  apis: {
    LEDGER_JSON_API: {
      uri: 'https://ledger-api.example.com',
      auth: { clientId, clientSecret },
    },
  },
});
```

## Official Documentation

- **[Ledger API Protocol Buffer Reference](https://docs.digitalasset.com/build/3.4/reference/lapi-proto-docs.html)** - Complete protobuf documentation
- **[Ledger JSON API OpenAPI Reference](https://docs.digitalasset.com/build/3.4/reference/json-api/openapi)** - REST API specification

## Protobuf Source Files

The protobuf definitions are in `libs/splice/canton/community/ledger-api/src/main/protobuf/com/daml/ledger/api/v2/`:

```
├── admin/                           # Administrative services
│   ├── identity_provider_config_service.proto
│   ├── package_management_service.proto
│   ├── party_management_service.proto
│   └── user_management_service.proto
├── commands.proto                   # Command definitions
├── command_service.proto            # Synchronous submission
├── command_submission_service.proto # Async submission
├── command_completion_service.proto # Completion streaming
├── completion.proto                 # Completion types
├── event.proto                      # Contract events
├── event_query_service.proto        # Event queries
├── interactive/                     # External signing
├── package_service.proto            # Package queries
├── state_service.proto              # Ledger state
├── transaction.proto                # Transaction types
├── update_service.proto             # Transaction streaming
└── version_service.proto            # Version info
```

## Type Mapping

| Protobuf Type | gRPC Client Type | JSON API Schema |
|---------------|------------------|-----------------|
| `Identifier` | `Identifier` | string (qualified) |
| `Record` | `DamlRecord` | `RecordSchema` |
| `Value` | `Value` | JSON object |
| `Commands` | `Commands` | `JsCommandsSchema` |
| `CreateCommand` | `CreateCommand` | `CreateCommandSchema` |
| `ExerciseCommand` | `ExerciseCommand` | `ExerciseCommandSchema` |
| `Transaction` | `Transaction` | `TransactionSchema` |
| `CreatedEvent` | `CreatedEvent` | `CreatedEventSchema` |

## Network Configuration

### LocalNet (cn-quickstart)

| Service | gRPC Port | JSON API Port |
|---------|-----------|---------------|
| app-provider | 3901 | 3975 |
| app-user | 2901 | 2975 |
| sv | 4901 | 4975 |

### Production

Configure endpoints via environment variables:

```bash
# gRPC endpoint
CANTON_MAINNET_PROVIDER_LEDGER_GRPC_URI=grpc-ledger.example.com:443

# JSON API endpoint
CANTON_MAINNET_PROVIDER_LEDGER_JSON_API_URI=https://json-ledger.example.com
```

## Version Compatibility

This SDK targets **Canton 3.4.x**. When upgrading:

1. Check [Canton release notes](https://docs.digitalasset.com/canton/release-notes/)
2. Update `libs/splice` submodule
3. Review protobuf changes in `com/daml/ledger/api/v2/`
4. Update SDK types if needed

## Related Resources

- [Canton Documentation](https://docs.digitalasset.com/build/3.4/)
- [Daml SDK Documentation](https://docs.daml.com/)
- [Hyperledger Labs Splice](https://github.com/hyperledger-labs/splice)
