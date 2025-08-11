# Canton Node SDK

A TypeScript SDK for interacting with Canton blockchain nodes.

## Features

- **Type-safe API client** with full TypeScript support
- **OAuth2 authentication** with automatic token management
- **Multi-provider support** across devnet/testnet/mainnet
- **Production-ready** error handling, logging, and retry logic
- **Environment-based configuration** with automatic .env loading

## Installation

```bash
npm install @fairmint/canton-node-sdk
```

## API Examples

### Transfer Instructions

The SDK provides methods for working with transfer instructions via the `/registry/transfer-instruction/v1/` endpoints:

```typescript
// Get transfer factory and choice context
const factory = await client.getTransferFactory({
  choiceArguments: { /* choice arguments */ },
  excludeDebugFields: false
});
console.log(`Factory ID: ${factory.factoryId}`);

// Get choice context to accept a transfer instruction
const acceptContext = await client.getTransferInstructionAcceptContext({
  transferInstructionId: 'contract-id-here',
  meta: { key: 'value' }
});

// Get choice context to reject a transfer instruction
const rejectContext = await client.getTransferInstructionRejectContext({
  transferInstructionId: 'contract-id-here',
  meta: { key: 'value' }
});

// Get choice context to withdraw a transfer instruction
const withdrawContext = await client.getTransferInstructionWithdrawContext({
  transferInstructionId: 'contract-id-here',
  meta: { key: 'value' }
});
```

## For Contributors

See [CONTRIBUTING.md](./CONTRIBUTING.md) for information about setting up the development
environment.
