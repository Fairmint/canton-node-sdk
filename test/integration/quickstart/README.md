# CN-Quickstart Integration Tests

This directory contains integration tests that validate the Canton Node SDK works correctly with cn-quickstart.

## Test Files

### `smoke-test.ts`

A comprehensive smoke test that validates:
- ✅ OAuth2 authentication with Keycloak
- ✅ Validator API connectivity and operations
- ✅ Ledger JSON API connectivity and operations
- ✅ SDK's built-in localnet defaults work correctly

**Run locally:**
```bash
# Prerequisites: cn-quickstart must be running
cd quickstart && make start

# Run the smoke test
npm run test:smoke
```

### `localnet-connection.test.ts`

Jest-based integration tests (requires SDK to be built).

## Running Tests

### Local Development

1. **Start CN-Quickstart:**
   ```bash
   cd cn-quickstart/quickstart
   make start
   ```

2. **Run smoke tests:**
   ```bash
   npm run test:smoke
   ```

### CI/CD

Tests run automatically in CI on:
- Every commit (CircleCI & GitHub Actions)
- Pull requests
- Nightly at 2 AM UTC

#### CircleCI

See `.circleci/config.yml` - the `test-cn-quickstart` job:
1. Sets up ubuntu machine with Docker support
2. Installs Node.js 20
3. Runs `npm run localnet:quickstart` to download and setup cn-quickstart
4. Starts cn-quickstart with `make start`
5. Waits for services to be healthy
6. Runs `npm run test:smoke`

#### GitHub Actions

See `.github/workflows/test-cn-quickstart.yml`:
- Same flow as CircleCI
- Uses GitHub Actions marketplace actions for setup
- Runs on `ubuntu-latest` runner

### Validating CI Configuration

**CircleCI:**
```bash
# Install CircleCI CLI
brew install circleci

# Validate config
circleci config validate

# Run locally (requires Docker)
circleci local execute --job test-cn-quickstart
```

**GitHub Actions:**
```bash
# Install act (GitHub Actions local runner)
brew install act

# Run workflow locally
act -j test-cn-quickstart
```

## Test Architecture

### Smoke Test Design

The smoke test uses a simple, self-contained approach:

```typescript
import { ValidatorApiClient, LedgerJsonApiClient } from '../../../src';

// Simple configuration - SDK handles the rest
const validatorClient = new ValidatorApiClient({
  network: 'localnet',
});

const jsonClient = new LedgerJsonApiClient({
  network: 'localnet',
});

// Run tests
await validatorClient.authenticate();
await validatorClient.getUserStatus();
// ... more tests
```

**Benefits:**
- ✅ No external test framework dependencies
- ✅ Fast execution (~200ms total)
- ✅ Clear pass/fail with exit codes
- ✅ Detailed error messages
- ✅ Easy to run in any CI system

### What Gets Tested

1. **SDK Configuration Defaults**
   - Validates `{ network: 'localnet' }` auto-configures everything
   - Confirms OAuth2 URL, API endpoints, credentials are set correctly

2. **OAuth2 Authentication**
   - Connects to Keycloak at `localhost:8082`
   - Obtains JWT access token using client credentials grant
   - Validates token is cached and reused

3. **Validator API Operations**
   - `getUserStatus()` - validates response structure
   - `getDsoPartyId()` - confirms DSO party is accessible

4. **Ledger JSON API Operations**
   - `getVersion()` - validates Canton version format
   - `getLedgerEnd()` - confirms ledger is accessible

## Troubleshooting

### Tests Fail with "Connection Refused"

**Cause:** CN-Quickstart is not running or services aren't ready.

**Fix:**
```bash
# Check if services are running
docker ps | grep -E "splice|keycloak"

# Check service logs
cd cn-quickstart/quickstart
make logs

# Restart services
make restart
```

### Tests Fail with "401 Unauthorized"

**Cause:** OAuth2 authentication is not working.

**Fix:**
```bash
# Verify Keycloak is accessible
curl http://localhost:8082/realms/AppProvider

# Check OAuth2 token endpoint
curl -X POST http://localhost:8082/realms/AppProvider/protocol/openid-connect/token \
  -d 'grant_type=client_credentials' \
  -d 'client_id=app-provider-validator' \
  -d 'client_secret=AL8648b9SfdTFImq7FV56Vd0KHifHBuC'
```

### CI Tests Timeout

**Cause:** Services take too long to start.

**Fix:** Increase timeouts in CI config:
- CircleCI: Add `no_output_timeout: 20m` to steps
- GitHub Actions: Increase `timeout-minutes` on job or step

### Local CircleCI Test Fails

**Note:** `circleci local execute` has limitations:
- Doesn't support `ubuntu-machine` executor perfectly
- May have Docker-in-Docker issues
- Use `act` for GitHub Actions or push to a branch for real CI testing

## Adding New Tests

To add a new test to the smoke test:

```typescript
await runTest('Test Name', async () => {
  const result = await client.someMethod();
  if (!result) {
    throw new Error('Expected result to be defined');
  }
});
```

The `runTest` helper:
- Catches errors automatically
- Tracks timing
- Reports pass/fail
- Accumulates results for summary

## Performance

Typical smoke test execution time:
- **Authentication:** ~70ms (first call)
- **API Calls:** ~15-40ms each (with cached token)
- **Total:** ~200ms

The SDK automatically caches OAuth2 tokens, so subsequent API calls are fast.
