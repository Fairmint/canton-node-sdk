---
layout: default
title: Getting Started - Canton Node SDK
sdk_version: 0.0.1
---

# Getting Started

Welcome to the Canton Node SDK! This guide will help you get up and running quickly.

## Installation

This package is published to GitHub Packages as a private package.

### Local Development

1. [Create a GitHub Personal Access Token](https://github.com/settings/tokens/new) with `read:packages` scope
2. Configure npm to use GitHub Packages for the `@fairmint` scope:

   ```bash
   echo "@fairmint:registry=https://npm.pkg.github.com" >> ~/.npmrc
   echo "//npm.pkg.github.com/:_authToken=<YOUR_GITHUB_TOKEN>" >> ~/.npmrc
   ```

3. Install the package:

   ```bash
   npm install @fairmint/canton-node-sdk
   ```

### CI/CD Setup

For automated builds, add the token as a secret in your CI environment:

```bash
echo "@fairmint:registry=https://npm.pkg.github.com" >> ~/.npmrc
echo "//npm.pkg.github.com/:_authToken=$GITHUB_TOKEN" >> ~/.npmrc
npm install
```

## Quick Examples

### Basic Setup

```typescript
import { ClientFactory, EnvLoader } from '@fairmint/canton-node-sdk';

// Check available API types
const availableTypes = ClientFactory.getRegisteredApiTypes();
console.log('Available API types:', availableTypes);
```

### Creating a Client

```typescript
import { ClientFactory, EnvLoader } from '@fairmint/canton-node-sdk';

try {
  // Load configuration from environment variables
  const config = EnvLoader.getConfig('LEDGER_JSON_API', {
    network: 'devnet',
    provider: '5n',
  });

  // Create a client instance
  const client = ClientFactory.createClient('LEDGER_JSON_API', config);

  console.log('Client created successfully:', client.constructor.name);
} catch (error) {
  console.error('Failed to create client:', error.message);
}
```

### Environment Configuration

Create a `.env` file in your project root:

```env
# Canton Node Configuration
CANTON_NETWORK=devnet
CANTON_PROVIDER=5n
CANTON_BASE_URL=https://your-canton-node-url.com
CANTON_AUTH_TOKEN=your-auth-token
```

### Error Handling

```typescript
import { ClientFactory } from '@fairmint/canton-node-sdk';

try {
  const client = ClientFactory.createClient('LEDGER_JSON_API');
  // Use the client...
} catch (error) {
  if (error.message.includes('configuration')) {
    console.error('Configuration error - check your environment variables');
  } else if (error.message.includes('authentication')) {
    console.error('Authentication error - check your auth token');
  } else {
    console.error('Unexpected error:', error.message);
  }
}
```

## Next Steps

- **[Operations Documentation](/operations/)** - Explore all available API operations
- **[Configuration Guide](/configuration/)** - Learn about advanced configuration options
- **[Error Handling](/error-handling/)** - Understand error types and handling patterns

## Requirements

- Node.js >= 18.0.0
- TypeScript (recommended)
- GitHub Personal Access Token with `read:packages` scope

---

_For contributors, see [CONTRIBUTING.md](https://github.com/Fairmint/canton-node-sdk/blob/main/CONTRIBUTING.md) for development setup._
