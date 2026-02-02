---
layout: default
title: Getting Started - Canton Node SDK
sdk_version: 0.0.127
---

# Getting Started

Welcome to the Canton Node SDK! This guide will help you get up and running quickly.

## Installation

Install the package from npm:

```bash
npm install @fairmint/canton-node-sdk
```

## Quick Start

### Basic Setup

```typescript
import { LedgerJsonApiClient, EnvLoader } from '@fairmint/canton-node-sdk';

// Load configuration from environment variables
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

### Validator API

```typescript
import { ValidatorApiClient, EnvLoader } from '@fairmint/canton-node-sdk';

const config = EnvLoader.getConfig('VALIDATOR_API', {
  network: 'devnet',
  provider: '5n',
});

const client = new ValidatorApiClient(config);

// Get wallet balance
const balance = await client.getWalletBalance();
console.log(`Balance: ${balance.total_unlocked_coin}`);
```

## Configuration

### Environment Variables

Create a `.env` file in your project root:

```env
# Network Configuration
CANTON_CURRENT_NETWORK=devnet
CANTON_CURRENT_PROVIDER=5n

# Authentication
CANTON_DEVNET_5N_AUTH_URL=https://devnet.5n.canton.com/oauth2/token
CANTON_DEVNET_5N_PARTY_ID=Alice::1220
CANTON_DEVNET_5N_USER_ID=alice

# Ledger JSON API
CANTON_DEVNET_5N_LEDGER_JSON_API_URI=https://devnet.5n.canton.com/ledger-json-api
CANTON_DEVNET_5N_LEDGER_JSON_API_CLIENT_ID=your-client-id
CANTON_DEVNET_5N_LEDGER_JSON_API_CLIENT_SECRET=your-client-secret

# Validator API
CANTON_DEVNET_5N_VALIDATOR_API_URI=https://devnet.5n.canton.com/validator-api
CANTON_DEVNET_5N_VALIDATOR_API_CLIENT_ID=your-validator-client-id
CANTON_DEVNET_5N_VALIDATOR_API_CLIENT_SECRET=your-validator-client-secret
```

### Programmatic Configuration

```typescript
const config = {
  network: 'devnet',
  provider: '5n',
  authUrl: 'https://devnet.5n.canton.com/oauth2/token',
  partyId: 'Alice::1220',
  userId: 'alice',
  apis: {
    LEDGER_JSON_API: {
      uri: 'https://devnet.5n.canton.com/ledger-json-api',
      auth: {
        clientId: 'your-client-id',
        clientSecret: 'your-client-secret',
      },
    },
  },
};

const client = new LedgerJsonApiClient(config);
```

## Environment Setup

### Development

Use `devnet` for development and testing:

```env
CANTON_CURRENT_NETWORK=devnet
CANTON_CURRENT_PROVIDER=5n
```

### Production

Switch to `mainnet` for production:

```env
CANTON_CURRENT_NETWORK=mainnet
CANTON_CURRENT_PROVIDER=5n
# Update URLs and credentials accordingly
```

## Key Features

- **Type-Safe**: Full TypeScript support with comprehensive type definitions
- **OAuth2 Authentication**: Automatic token management and refresh
- **Multi-Environment**: Easy switching between devnet, testnet, and mainnet
- **Production-Ready**: Comprehensive error handling and logging
- **Flexible Configuration**: Environment variables or programmatic setup

## Next Steps

- **[Utility Functions](/utils/)** - Helper functions for common operations
- **[Ledger JSON API Operations](/ledger-json-api-operations/)** - Complete Ledger JSON API reference
- **[Validator API Operations](/validator-api-operations/)** - Complete Validator API reference
- **[Ledger API Protobufs](/ledger-api-protobufs/)** - Protocol Buffer reference and schema mapping
- **[Features](/features/)** - Detailed capabilities overview

## Requirements

- Node.js >= 18.0.0
- TypeScript (recommended)

---

_For contributors, see [CONTRIBUTING.md](https://github.com/Fairmint/canton-node-sdk/blob/main/CONTRIBUTING.md) for development setup._
