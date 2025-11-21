# LocalNet Setup and Testing Guide for AI

## Overview

This document provides instructions for setting up Canton Network LocalNet and testing API responses
to get exact values for integration tests.

## Quick Setup Process

### Prerequisites

- Node.js 20+
- Docker and Docker Compose running
- Git with submodules
- Network connectivity (firewall disabled if needed)

### Step-by-Step Commands

```bash
# 1. Initialize submodules
git submodule update --init --recursive

# 2. Install dependencies
npm install

# 3. Clone splice artifacts (required for OpenAPI types)
npm run artifacts:clone-splice

# 4. Build the SDK
npm run build

# 5. Setup cn-quickstart with OAuth2
cd cn-quickstart/quickstart
echo "2" | make setup  # Select option 2 for OAuth2

# 6. Install Daml SDK
make install-daml-sdk

# 7. Start services (takes ~3-5 minutes)
export PATH="$HOME/.daml/bin:$PATH"
make start

# 8. Wait for services to be ready
# Keycloak: http://localhost:8082/realms/AppProvider
# Validator API: http://localhost:3903/api/validator/v0/wallet/user-status

# 9. Test the API
cd ../..
npm test -- test/integration/localnet/get-user-status.test.ts
```

## Testing API Endpoints

### Method 1: Run Integration Tests

```bash
npm test -- test/integration/localnet/get-user-status.test.ts
```

The test output will show actual vs expected values if there's a mismatch.

### Method 2: Create Test Script

Create a file `/tmp/test-api.ts`:

```typescript
#!/usr/bin/env tsx
import { ValidatorApiClient } from '/home/runner/work/canton-node-sdk/canton-node-sdk/src';

async function main(): Promise<void> {
  const client = new ValidatorApiClient({ network: 'localnet' });
  const response = await client.getUserStatus();
  console.log(JSON.stringify(response, null, 2));
}

main().catch(console.error);
```

Run it:

```bash
npx tsx /tmp/test-api.ts
```

## getUserStatus Expected Values

For a **fresh localnet** (before any user onboarding):

```typescript
{
  party_id: '',
  user_onboarded: false,
  user_wallet_installed: false,
  has_featured_app_right: false
}
```

### Important Notes:

- The validator API represents a wallet user that needs to be onboarded
- On fresh localnet, the user is NOT onboarded yet, hence all false values
- Backend service parties (like `app_provider_quickstart-runner-1::...`) are different from wallet
  users
- Party ID format is `{namespace}_quickstart-runner-1::{fingerprint}`, NOT `PAR::`

## Party ID Format

Canton Network party IDs in localnet follow this format:

```
{namespace}_quickstart-runner-1::{64-char-hex-fingerprint}
```

Examples from logs:

- `app_provider_quickstart-runner-1::122046687f0982bde4d696a66d0a6882142ca479cafa47a588a1d5fcca415e04759c`
- `app_user_quickstart-runner-1::12208e93000cfe101194513998b0efebae89c363bd2f2835a88552acc561b9b0ecf3`

Note: These are backend service parties, not the wallet user party returned by getUserStatus.

## Common Issues

### Docker Build Failures

- **Symptom**: Alpine package manager "Permission denied" errors
- **Solution**: Disable firewall or ensure network connectivity
- **Command**: Check Docker status with `docker ps`

### Daml Command Not Found

- **Symptom**: Build fails with "command 'daml' not found"
- **Solution**: Add `$HOME/.daml/bin` to PATH before running make commands
- **Command**: `export PATH="$HOME/.daml/bin:$PATH"`

### Services Not Ready

- **Symptom**: API calls fail with connection errors
- **Solution**: Wait 3-5 minutes after `make start` completes
- **Check**: `curl http://localhost:8082/realms/AppProvider`

## Cleanup

Stop services:

```bash
cd cn-quickstart/quickstart
make stop
```

## For Future AI Reference

When asked to get actual API response values from localnet:

1. **Check if localnet is running**: Look for Docker containers
2. **If not running**: Follow the Quick Setup Process above
3. **Run the test**: Use Method 1 or 2 above to get actual values
4. **Update test**: Replace expected values with actual values from the response
5. **Verify**: Run the test again to ensure it passes

**Key Insight**: Fresh localnet has users that are NOT onboarded yet. The getUserStatus endpoint
returns empty/false values initially. This is the correct expected state for integration tests
against a fresh localnet.
