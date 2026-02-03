---
layout: default
title: Ledger API Protocol Buffers Reference
sdk_version: 0.0.127
---

# Ledger API Protocol Buffers

The Canton Ledger API is defined using [Protocol Buffers](https://protobuf.dev/) (protobufs), which serve as the canonical specification for the API. This SDK implements a TypeScript interface that maps to these protobuf definitions.

## Official Documentation

The authoritative reference for the Ledger API protobufs is maintained by Digital Asset:

- **[Ledger API Protocol Buffer Reference](https://docs.digitalasset.com/build/3.4/reference/lapi-proto-docs.html)** - Complete protobuf documentation
- **[Ledger JSON API OpenAPI Reference](https://docs.digitalasset.com/build/3.4/reference/json-api/openapi)** - JSON API equivalent

## Understanding the API Layers

Canton exposes the Ledger API through two interfaces:

1. **gRPC/Protobuf API** - The native binary protocol, optimized for performance
2. **JSON API** - A REST/WebSocket interface that mirrors the protobuf definitions

This SDK provides clients for both:
- `LedgerJsonApiClient` - For the REST/WebSocket JSON API
- `LedgerGrpcClient` - For direct gRPC access (higher performance)

## Using the gRPC Client

```typescript
import { LedgerGrpcClient, Values, createCreateCommand } from '@fairmint/canton-node-sdk';

// Create a gRPC client
const client = new LedgerGrpcClient({
  endpoint: 'localhost:6865',
  accessToken: 'your-token',
  useTls: false, // Set to true for production
});

// Get version
const version = await client.getVersion();
console.log(`Ledger API version: ${version.version}`);

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

## Protobuf Source Files

The protobuf definitions are available in the [Hyperledger Labs Splice repository](https://github.com/hyperledger-labs/splice) (included as a git submodule in `libs/splice`):

```
libs/splice/canton/community/ledger-api/src/main/protobuf/com/daml/ledger/api/v2/
├── admin/                        # Administrative services
│   ├── identity_provider_config_service.proto
│   ├── package_management_service.proto
│   ├── party_management_service.proto
│   └── user_management_service.proto
├── commands.proto                # Command definitions (Create, Exercise, etc.)
├── command_service.proto         # Synchronous command submission
├── command_submission_service.proto  # Async command submission
├── command_completion_service.proto  # Command completion streaming
├── completion.proto              # Completion types
├── event.proto                   # Contract events (Created, Archived)
├── event_query_service.proto     # Event queries
├── interactive/                  # Interactive submission (external signing)
│   └── interactive_submission_service.proto
├── package_service.proto         # Package queries
├── state_service.proto           # Ledger state queries
├── transaction.proto             # Transaction types
├── update_service.proto          # Transaction/update streaming
└── version_service.proto         # Version info
```

## Schema Mapping

The SDK's Zod schemas in `src/clients/ledger-json-api/schemas/` map directly to the protobuf definitions:

| Protobuf Message | SDK Schema | Description |
|------------------|------------|-------------|
| `Commands` | `JsCommandsSchema` | Composite command container |
| `CreateCommand` | `CreateCommandSchema` | Contract creation |
| `ExerciseCommand` | `ExerciseCommandSchema` | Choice exercise |
| `ExerciseByKeyCommand` | `ExerciseByKeyCommandSchema` | Exercise by contract key |
| `CreateAndExerciseCommand` | `CreateAndExerciseCommandSchema` | Create and exercise atomically |
| `DisclosedContract` | `DisclosedContractSchema` | Pre-disclosed contracts |
| `CreatedEvent` | `CreatedEventSchema` | Contract creation event |
| `ArchivedEvent` | `ArchivedEventSchema` | Contract archival event |
| `Transaction` | `TransactionSchema` | Transaction container |
| `TransactionTree` | `TransactionTreeSchema` | Hierarchical transaction view |

## Key Protobuf Concepts

### Identifiers

Contract template identifiers follow the format defined in `value.proto`:

```protobuf
message Identifier {
  string package_id = 1;    // Package containing the template
  string module_name = 2;   // Module path (e.g., "Main")
  string entity_name = 3;   // Template name (e.g., "Asset")
}
```

In the SDK, these are typically expressed as qualified strings: `packageId:moduleName:entityName`

### Value Types

The Ledger API uses a recursive `Value` type for contract arguments:

```protobuf
message Value {
  oneof Sum {
    Record record = 1;
    Variant variant = 2;
    string contract_id = 3;
    List list = 4;
    int64 int64 = 5;
    string numeric = 6;
    string text = 7;
    int64 timestamp = 8;
    string party = 9;
    bool bool = 10;
    google.protobuf.Empty unit = 11;
    int32 date = 12;
    Optional optional = 13;
    TextMap text_map = 14;
    GenMap gen_map = 15;
  }
}
```

The SDK represents this as a flexible `RecordSchema` that accepts JSON-compatible objects.

### Deduplication

Commands support deduplication to prevent double-submission:

```protobuf
oneof deduplication_period {
  google.protobuf.Duration deduplication_duration = 5;
  int64 deduplication_offset = 6;
}
```

The SDK provides `DeduplicationDurationSchema` and `DeduplicationOffsetSchema` for this purpose.

## Working with Protobufs Directly

If you need to work with the raw protobuf definitions:

```bash
# Initialize the submodule
git submodule update --init --recursive

# Navigate to protobuf directory
cd libs/splice/canton/community/ledger-api/src/main/protobuf
```

## Version Compatibility

This SDK targets **Canton 3.4.x** protobuf definitions. When upgrading:

1. Check the [Canton release notes](https://docs.digitalasset.com/canton/release-notes/) for breaking changes
2. Update the `libs/splice` submodule to the matching version
3. Review protobuf changes in `com/daml/ledger/api/v2/`
4. Update SDK schemas if needed

## Related Resources

- [Canton Documentation](https://docs.digitalasset.com/build/3.4/) - Official Canton docs
- [Daml SDK Documentation](https://docs.daml.com/) - Daml language reference
- [Hyperledger Labs Splice](https://github.com/hyperledger-labs/splice) - Open source Canton implementation
