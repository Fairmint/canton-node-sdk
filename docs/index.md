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

- **[Getting Started](/getting-started/)** - Installation and basic setup
- **[Features](/features/)** - Detailed capabilities overview
- **[Configuration](/configuration/)** - Environment and client configuration
- **[Error Handling](/error-handling/)** - Error types and handling patterns
- **[Operations](/operations/)** - Complete API reference

## Requirements

- Node.js >= 18.0.0
- TypeScript (recommended)
- GitHub Personal Access Token with `read:packages` scope

---

_Built with ❤️ by the Fairmint team_
