---
sdk_version: 0.0.127
layout: default
title: Features & Benefits - Canton Node SDK
---

# Features & Benefits

The Canton Node SDK provides a seamless, type-safe experience for developers building applications on the Canton blockchain.

## Type Safety & Developer Experience

### Full TypeScript Support

Every API operation is fully typed with comprehensive TypeScript definitions:

```typescript
// TypeScript knows exactly what parameters are required
const user = await client.createUser({
  user: {
    id: 'alice',
    primaryParty: 'Alice::1220',
    isDeactivated: false,
    identityProviderId: 'default',
  },
  rights: [{ kind: { CanActAs: { party: 'Alice::1220' } } }],
});
// TypeScript knows the exact structure of the response
console.log(user.user.id); // ✅ Type-safe
```

## Authentication & Security

### OAuth2 Authentication

Built-in OAuth2 support with automatic token management:

```typescript
// Authentication is handled automatically
const client = new LedgerJsonApiClient(config);
// Tokens are managed behind the scenes
const user = await client.getAuthenticatedUser({
  identityProviderId: 'default',
});
```

### Environment-Based Configuration

Secure configuration management with environment variables:

```typescript
// Switch between environments easily
const devConfig = EnvLoader.getConfig('LEDGER_JSON_API', {
  network: 'devnet',
  provider: '5n',
});

const prodConfig = EnvLoader.getConfig('LEDGER_JSON_API', {
  network: 'mainnet',
  provider: '5n',
});
```

## Production-Ready Infrastructure

### Comprehensive Error Handling

Robust error management with custom error types:

```typescript
try {
  const result = await client.uploadDarFile({ darFile: buffer });
} catch (error) {
  if (error instanceof ConfigurationError) {
    console.error('Check your environment configuration');
  } else if (error instanceof AuthenticationError) {
    console.error('Authentication failed - check your credentials');
  }
}
```

### Configurable Logging

Flexible logging system with file and console output options.

## Complete API Coverage

### Ledger JSON API v2

Full implementation of Canton's Ledger JSON API:

#### Package Management

```typescript
// Upload DAR files
await client.uploadDarFile({ darFile: buffer });

// List available packages
const packages = await client.listPackages();

// Check package status
const status = await client.getPackageStatus({ packageId: 'my-package' });
```

#### Transaction Operations

```typescript
// Subscribe to transaction updates with easy-to-use options
await client.subscribeToUpdates({
  beginExclusive: 1000,
  templateIds: ['Module:Template'],
  includeCreatedEventBlob: true,
  includeReassignments: true,
  onMessage: (msg) => {
    console.log('Update:', msg);
  },
});

// Query specific transactions
const transaction = await client.getTransactionById({
  transactionId: 'tx-123',
});
```

#### Event Handling

```typescript
// Get events for a specific contract
const events = await client.getEventsByContractId({
  contractId: 'contract-123',
  eventFormat: { verbose: true },
});
```

#### User Management

```typescript
// Create users with specific rights
await client.createUser({
  user: { id: 'alice', primaryParty: 'Alice::1220' },
  rights: [{ kind: { CanActAs: { party: 'Alice::1220' } } }],
});

// Manage user permissions
await client.grantUserRights({
  userId: 'alice',
  rights: [{ kind: { CanReadAs: { party: 'Bob::1221' } } }],
});
```

## Performance & Reliability

- **Automatic Retry Logic**: Built-in retry mechanisms for transient failures
- **Connection Management**: Efficient HTTP connection handling with pooling
- **Request/Response Validation**: Automatic validation using Zod schemas

## Developer Tools

### Direct Client Instantiation

Simple and direct client creation:

```typescript
// Create clients directly
const client = new LedgerJsonApiClient(config);
```

## Use Cases

The Canton Node SDK is perfect for:

- **DeFi Applications**: Building decentralized finance protocols
- **Enterprise Solutions**: Corporate blockchain applications
- **NFT Platforms**: Digital asset management systems
- **Supply Chain**: Tracking and verification systems
- **Identity Management**: Decentralized identity solutions
- **Gaming**: Blockchain-based gaming applications

## Migration Benefits

If you're currently using raw HTTP calls or other Canton clients:

- **Reduced Boilerplate**: 90% less code for API interactions
- **Type Safety**: Catch errors at compile time instead of runtime
- **Better DX**: IntelliSense and autocomplete support
- **Reliability**: Built-in error handling and retry logic

---

_Ready to get started? Check out the [Getting Started Guide](/getting-started/) for installation and basic usage examples._
