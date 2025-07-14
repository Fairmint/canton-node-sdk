---
layout: default
title: Configuration Guide - Canton Node SDK
---

# Configuration Guide

The Canton Node SDK provides flexible configuration options to suit different deployment scenarios and requirements.

## 🔧 Basic Configuration

### **Environment Variables**

The SDK uses environment variables for configuration. Create a `.env` file in your project root:

```env
# Network and Provider Selection
CANTON_CURRENT_NETWORK=devnet
CANTON_CURRENT_PROVIDER=5n

# Authentication URLs
CANTON_DEVNET_5N_AUTH_URL=https://devnet.5n.canton.com/oauth2/token

# Party and User Configuration
CANTON_DEVNET_5N_PARTY_ID=Alice::1220
CANTON_DEVNET_5N_USER_ID=alice

# API Endpoints
CANTON_DEVNET_5N_LEDGER_JSON_API_URI=https://devnet.5n.canton.com/ledger-json-api
CANTON_DEVNET_5N_LEDGER_JSON_API_CLIENT_ID=your-client-id
CANTON_DEVNET_5N_LEDGER_JSON_API_CLIENT_SECRET=your-client-secret
```

### **Programmatic Configuration**

You can also configure the SDK programmatically:

```typescript
import { ClientFactory } from '@fairmint/canton-node-sdk';

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

const client = ClientFactory.createClient('LEDGER_JSON_API', config);
```

## 🌍 Multi-Environment Setup

### **Development Environment**

```env
# Development Configuration
CANTON_CURRENT_NETWORK=devnet
CANTON_CURRENT_PROVIDER=5n

# Devnet 5N Provider
CANTON_DEVNET_5N_AUTH_URL=https://devnet.5n.canton.com/oauth2/token
CANTON_DEVNET_5N_PARTY_ID=Alice::1220
CANTON_DEVNET_5N_USER_ID=alice
CANTON_DEVNET_5N_LEDGER_JSON_API_URI=https://devnet.5n.canton.com/ledger-json-api
CANTON_DEVNET_5N_LEDGER_JSON_API_CLIENT_ID=dev-client-id
CANTON_DEVNET_5N_LEDGER_JSON_API_CLIENT_SECRET=dev-client-secret
```

### **Production Environment**

```env
# Production Configuration
CANTON_CURRENT_NETWORK=mainnet
CANTON_CURRENT_PROVIDER=5n

# Mainnet 5N Provider
CANTON_MAINNET_5N_AUTH_URL=https://mainnet.5n.canton.com/oauth2/token
CANTON_MAINNET_5N_PARTY_ID=Alice::1220
CANTON_MAINNET_5N_USER_ID=alice
CANTON_MAINNET_5N_LEDGER_JSON_API_URI=https://mainnet.5n.canton.com/ledger-json-api
CANTON_MAINNET_5N_LEDGER_JSON_API_CLIENT_ID=prod-client-id
CANTON_MAINNET_5N_LEDGER_JSON_API_CLIENT_SECRET=prod-client-secret
```

### **Environment Switching**

```typescript
import { EnvLoader } from '@fairmint/canton-node-sdk';

// Load configuration for different environments
const devConfig = EnvLoader.getConfig('LEDGER_JSON_API', {
  network: 'devnet',
  provider: '5n',
});

const prodConfig = EnvLoader.getConfig('LEDGER_JSON_API', {
  network: 'mainnet',
  provider: '5n',
});

// Use environment-specific configuration
const client = ClientFactory.createClient(
  'LEDGER_JSON_API',
  process.env.NODE_ENV === 'production' ? prodConfig : devConfig
);
```

## 🔐 Authentication Configuration

### **OAuth2 Setup**

The SDK supports OAuth2 authentication with automatic token management:

```typescript
// Authentication is handled automatically
const client = ClientFactory.createClient('LEDGER_JSON_API', config);

// Get authenticated user information
const user = await client.getAuthenticatedUser({
  identityProviderId: 'default',
});
```

### **Multiple Identity Providers**

Support for multiple identity providers:

```env
# Default Identity Provider
CANTON_DEVNET_5N_LEDGER_JSON_API_CLIENT_ID=default-client-id
CANTON_DEVNET_5N_LEDGER_JSON_API_CLIENT_SECRET=default-client-secret

# Custom Identity Provider
CANTON_DEVNET_5N_CUSTOM_PROVIDER_CLIENT_ID=custom-client-id
CANTON_DEVNET_5N_CUSTOM_PROVIDER_CLIENT_SECRET=custom-client-secret
```

## 📝 Logging Configuration

### **File Logger**

Configure file-based logging for production environments:

```typescript
import { FileLogger } from '@fairmint/canton-node-sdk';

const config = {
  ...EnvLoader.getConfig('LEDGER_JSON_API'),
  logger: new FileLogger({
    logDir: './logs',
    logLevel: 'info',
    maxFileSize: '10MB',
    maxFiles: 5,
  }),
};

const client = ClientFactory.createClient('LEDGER_JSON_API', config);
```

### **Console Logger**

Use console logging for development:

```typescript
import { ConsoleLogger } from '@fairmint/canton-node-sdk';

const config = {
  ...EnvLoader.getConfig('LEDGER_JSON_API'),
  logger: new ConsoleLogger({
    logLevel: 'debug',
    includeTimestamp: true,
  }),
};
```

## 🚀 Performance Configuration

### **HTTP Client Settings**

Configure HTTP client behavior:

```typescript
const config = {
  ...EnvLoader.getConfig('LEDGER_JSON_API'),
  httpConfig: {
    timeout: 30000, // 30 seconds
    maxRetries: 3,
    retryDelay: 1000, // 1 second
    keepAlive: true,
    maxSockets: 10,
  },
};
```

### **Connection Pooling**

Optimize connection management:

```typescript
const config = {
  ...EnvLoader.getConfig('LEDGER_JSON_API'),
  connectionPool: {
    maxConnections: 20,
    maxIdleTime: 60000, // 1 minute
    keepAliveTimeout: 30000, // 30 seconds
  },
};
```

## 🔒 Security Best Practices

### **Environment Variable Security**

- Never commit `.env` files to version control
- Use different credentials for each environment
- Rotate credentials regularly
- Use secure credential management in production

```bash
# Add to .gitignore
.env
.env.local
.env.production
```

### **CI/CD Configuration**

For automated deployments, use environment secrets:

```yaml
# GitHub Actions example
env:
  CANTON_MAINNET_5N_LEDGER_JSON_API_CLIENT_ID: ${{ secrets.CANTON_CLIENT_ID }}
  CANTON_MAINNET_5N_LEDGER_JSON_API_CLIENT_SECRET: ${{ secrets.CANTON_CLIENT_SECRET }}
```

### **Docker Configuration**

For containerized deployments:

```dockerfile
# Use multi-stage build to avoid exposing secrets
FROM node:18-alpine AS builder
COPY package*.json ./
RUN npm ci --only=production

FROM node:18-alpine
COPY --from=builder /app/node_modules ./node_modules
COPY . .
# Environment variables will be injected at runtime
CMD ["node", "index.js"]
```

## 🧪 Testing Configuration

### **Test Environment Setup**

Create a separate test configuration:

```env
# Test Configuration
CANTON_TESTNET_5N_AUTH_URL=https://testnet.5n.canton.com/oauth2/token
CANTON_TESTNET_5N_PARTY_ID=TestAlice::1220
CANTON_TESTNET_5N_USER_ID=test-alice
CANTON_TESTNET_5N_LEDGER_JSON_API_URI=https://testnet.5n.canton.com/ledger-json-api
CANTON_TESTNET_5N_LEDGER_JSON_API_CLIENT_ID=test-client-id
CANTON_TESTNET_5N_LEDGER_JSON_API_CLIENT_SECRET=test-client-secret
```

### **Mock Configuration**

For unit testing without real API calls:

```typescript
// Mock configuration for testing
const mockConfig = {
  network: 'testnet',
  provider: '5n',
  apis: {
    LEDGER_JSON_API: {
      uri: 'http://localhost:8080',
      auth: {
        clientId: 'mock-client-id',
        clientSecret: 'mock-client-secret',
      },
    },
  },
};
```

## 🔍 Configuration Validation

### **Schema Validation**

The SDK validates configuration using Zod schemas:

```typescript
import { EnvLoader } from '@fairmint/canton-node-sdk';

try {
  const config = EnvLoader.getConfig('LEDGER_JSON_API');
  // Configuration is valid
} catch (error) {
  if (error instanceof ConfigurationError) {
    console.error('Configuration error:', error.message);
    // Handle configuration issues
  }
}
```

### **Required Fields**

Ensure all required configuration fields are present:

- `network`: Target network (devnet, testnet, mainnet)
- `provider`: Canton provider (5n, etc.)
- `authUrl`: OAuth2 token endpoint
- `partyId`: Your party identifier
- `userId`: Your user identifier
- API-specific configuration (URI, client credentials)

## 📊 Monitoring Configuration

### **Health Checks**

Configure health check endpoints:

```typescript
// Check API connectivity
const version = await client.getVersion();
console.log(`API Version: ${version.version}`);

// Check authentication
const user = await client.getAuthenticatedUser({
  identityProviderId: 'default',
});
console.log(`Authenticated as: ${user.user.id}`);
```

### **Metrics Collection**

Integrate with monitoring systems:

```typescript
const config = {
  ...EnvLoader.getConfig('LEDGER_JSON_API'),
  metrics: {
    enabled: true,
    endpoint: 'http://localhost:9090/metrics',
    interval: 60000, // 1 minute
  },
};
```

---

_For more information about specific API operations, see the [Operations Documentation](/operations/)._
