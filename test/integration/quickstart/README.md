# Quickstart Integration Tests

This directory contains integration tests for the canton-node-sdk that run against a live localnet instance, following the principles and approach from the [cn-quickstart](https://github.com/digital-asset/cn-quickstart) repository.

## Overview

The cn-quickstart repository provides a comprehensive example of how to build applications on Canton Network. These integration tests apply those principles to validate the canton-node-sdk against real Canton services.

## What's Different from cn-quickstart?

The cn-quickstart repository includes:
- A complete demo application (backend + frontend)
- Licensing workflow examples
- Multiple Docker modules (keycloak, PQS, observability)
- Splice LocalNet for the Canton infrastructure

For SDK testing, we focus on:
- **Just the Splice LocalNet module** - the core Canton infrastructure
- **Simple API validation** - testing SDK operations work correctly
- **Lightweight setup** - minimal overhead for testing

## Prerequisites

1. **Docker and Docker Compose** installed and running
2. **Node.js 18+** installed
3. **LocalNet environment variables** configured

## Setup

### 1. Download and Setup LocalNet

```bash
npm run localnet:setup
```

This downloads the Splice LocalNet bundle (version 0.4.22 by default).

### 2. Configure Environment Variables

```bash
# Set environment variables (required)
export LOCALNET_DIR="/tmp/splice-localnet/splice-node/docker-compose/localnet"
export IMAGE_TAG="0.4.22"

# Or add to your shell profile
echo 'export LOCALNET_DIR="/tmp/splice-localnet/splice-node/docker-compose/localnet"' >> ~/.bashrc
echo 'export IMAGE_TAG="0.4.22"' >> ~/.bashrc
source ~/.bashrc
```

### 3. Configure SDK Environment

```bash
# Copy the localnet example configuration
cp example.env.localnet .env

# The .env file contains the necessary configuration for connecting to localnet
# All values are pre-configured for the default localnet setup
```

## Running Tests

### Start LocalNet

```bash
npm run localnet:start
```

This starts:
- Canton nodes (app-provider, app-user, sv)
- PostgreSQL database
- JSON API endpoints (ports 39750, 29750, 49750)
- Validator API endpoints (ports 39030, 29030, 49030)
- Web UIs (if profiles enabled)

Wait ~1-2 minutes for all services to be fully initialized.

### Check LocalNet Status

```bash
npm run localnet:status
```

### Run Integration Tests

```bash
# Run all tests including integration tests
npm test

# Or run just the integration tests
npm test -- test/integration/quickstart
```

### Stop LocalNet

```bash
npm run localnet:stop
```

## Available Tests

### GetVersion Test (`get-version.test.ts`)

Tests the simplest API endpoint - GetVersion. This validates:
- SDK can connect to localnet JSON API
- Authentication works correctly
- API returns expected response structure
- Version information is properly formatted

This is the baseline test that proves end-to-end connectivity works.

## Test Structure

Each integration test follows this pattern:

```typescript
describe('API Integration Test', () => {
  let client: LedgerJsonApiClient;

  beforeAll(() => {
    // Load configuration from environment
    const config = EnvLoader.getConfig('LEDGER_JSON_API');
    client = new LedgerJsonApiClient(config);
  });

  it('should perform operation', async () => {
    const response = await client.someOperation();
    expect(response).toBeDefined();
    // Additional validations...
  }, 30000); // Allow 30s for network operations
});
```

## LocalNet Endpoints

Once LocalNet is running:

### JSON APIs
- **App Provider**: http://localhost:39750/v2/...
- **App User**: http://localhost:29750/v2/...
- **Super Validator**: http://localhost:49750/v2/...

### Validator APIs
- **App Provider**: http://localhost:39030/api/validator/...
- **App User**: http://localhost:29030/api/validator/...
- **Super Validator**: http://localhost:49030/api/validator/...

### Web UIs
- **App Provider Wallet**: http://wallet.localhost:3000
- **App User Wallet**: http://wallet.localhost:2000
- **Scan UI**: http://scan.localhost:4000
- **SV UI**: http://sv.localhost:4000

## Troubleshooting

### Port Already in Use

```bash
npm run localnet:stop
# Wait a few seconds
npm run localnet:start
```

### Services Not Ready

LocalNet can take 1-2 minutes to fully initialize. Check status:

```bash
npm run localnet:status
```

Or check specific service logs:

```bash
docker compose -f $LOCALNET_DIR/compose.yaml logs -f app-provider
```

### Connection Refused

Ensure LocalNet is running and healthy:

```bash
# Check if JSON API is responding
curl http://localhost:39750/v2/version
```

### Test Timeouts

Integration tests have 30-second timeouts. If tests are timing out:
1. Verify LocalNet is fully started
2. Check no other services are using the required ports
3. Look at Docker logs for errors

## Development Workflow

1. **Start LocalNet once**: `npm run localnet:start`
2. **Leave it running** while developing
3. **Run tests multiple times**: `npm test -- test/integration/quickstart`
4. **Stop when done**: `npm run localnet:stop`

This avoids the 1-2 minute startup time between test runs.

## Adding New Tests

To add a new integration test:

1. Create a new file in `test/integration/quickstart/`
2. Follow the existing test pattern
3. Test a specific SDK operation end-to-end
4. Document what the test validates
5. Use descriptive test names

Example:

```typescript
// test/integration/quickstart/list-packages.test.ts
describe('ListPackages Integration Test', () => {
  // Test implementation...
});
```

## References

- [cn-quickstart Repository](https://github.com/digital-asset/cn-quickstart)
- [cn-quickstart Documentation](https://github.com/digital-asset/cn-quickstart/blob/main/README.md)
- [Splice LocalNet Documentation](https://github.com/hyperledger-labs/splice)
- [Canton Network Documentation](https://www.canton.network/)

## Notes

- These tests require a running LocalNet instance
- Tests are not included in the standard `npm test` run by default
- Tests use real network calls and have longer timeouts (30s)
- Tests validate the SDK works against actual Canton services
- Configuration comes from environment variables, same as production usage
