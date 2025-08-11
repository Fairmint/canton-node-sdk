---
layout: default
title: Canton Node SDK Documentation
sdk_version: 0.0.1
---

# Canton Node SDK

A TypeScript SDK for interacting with Canton blockchain.

## Quick Start

```typescript
import { LedgerJsonApiClient, EnvLoader } from '@fairmint/canton-node-sdk';

// Optionally load configuration from environment variables
const config = EnvLoader.getConfig('LEDGER_JSON_API', {
  network: 'devnet',
  provider: '5n',
});

// Create a client
const client = new LedgerJsonApiClient(config);

// Use the client
const version = await client.getVersion();
console.log(`Connected to Canton ${version.version}`);
```

## Key Features

- **Type-Safe**: Full TypeScript support
- **OAuth2 Authentication**: Automatic token management and refresh
- **Multi-Environment**: Support for devnet, testnet, and mainnet
- **Production-Ready**: Comprehensive error handling and logging

## Documentation

- **[Getting Started](/getting-started/)** - Installation, setup, and configuration
- **[Features](/features/)** - Detailed capabilities overview
- **[Utility Functions](/utils/)** - Helper functions for common operations
- **[Ledger JSON API Operations](/ledger-json-api-operations/)** - Complete Ledger JSON API reference
- **[Validator API Operations](/validator-api-operations/)** - Complete Validator API reference

## Requirements

- Node.js >= 18.0.0
- TypeScript (recommended)
