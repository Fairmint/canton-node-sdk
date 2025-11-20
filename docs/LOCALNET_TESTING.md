# LocalNet Testing Guide

This guide covers testing the Canton Node SDK against a local Canton network (LocalNet). The SDK
includes multiple types of tests that run against LocalNet to validate functionality.

## Test Types

### 1. End-to-End (E2E) Tests

**Location**: `test/e2e/`

E2E tests validate real API interactions with valid inputs and expected outputs. These tests serve
multiple purposes:

- **Validation**: Verify the SDK works correctly with real Canton services
- **Documentation**: Demonstrate how to use SDK APIs with real examples
- **Regression Testing**: Catch breaking changes during development
- **PR Reviews**: Show expected behavior changes in pull requests

**Coverage**:

- `version.e2e.ts` - Tests the `getVersion()` API
- `packages.e2e.ts` - Tests the `listPackages()` API

**Run E2E Tests**:

```bash
npm run test:e2e
```

See [test/e2e/README.md](../test/e2e/README.md) for detailed documentation.

### 2. Simulation Tests

**Location**: `simulations/`

Simulation tests run API operations and save responses to JSON files for comparison. These are
useful for regression testing and understanding API response structures.

**Run Simulations**:

```bash
npm run simulate
```

### 3. Integration Tests

**Location**: `test/integration/quickstart/`

Integration tests validate the SDK works with cn-quickstart. These use Jest and test the SDK's
built-in localnet defaults.

**Run Integration Tests**:

```bash
npm run test:integration
```

### 4. Smoke Test

**Location**: `test/integration/quickstart/smoke-test.ts`

A fast, comprehensive smoke test that validates core functionality.

**Run Smoke Test**:

```bash
npm run test:smoke
```

## Setting Up LocalNet

### Option 1: CN-Quickstart (Recommended)

```bash
# Setup CN-Quickstart LocalNet (first time only)
npm run localnet:quickstart

# Environment variables are written to .env.localnet
cat .env.localnet

# Configure SDK environment
cp example.env.localnet .env

# Start LocalNet
npm run localnet:start

# Check status
npm run localnet:status

# Stop LocalNet
npm run localnet:stop
```

### Option 2: Splice Bundle

```bash
# Setup Splice LocalNet (requires GITHUB_TOKEN)
export GITHUB_TOKEN=your_token_here
npm run localnet:setup

# Start LocalNet
npm run localnet:start
```

## Running All Tests

```bash
# Start LocalNet first
npm run localnet:start

# Wait for services to be ready (30-60 seconds)
npm run localnet:status

# Run all tests
npm run test:regression  # Runs simulations
npm run test:e2e         # Runs E2E tests
npm run test:integration # Runs Jest integration tests
npm run test:smoke       # Runs smoke test
```

## CI/CD Integration

Tests run automatically in CI:

- **Unit Tests**: Run on every commit (no LocalNet required)
- **Linting**: Code quality checks on every commit
- **Integration Tests**: LocalNet tests on every commit
- **Nightly Regression**: Scheduled daily tests at 2 AM UTC

See [.circleci/config.yml](../.circleci/config.yml) for the complete CI configuration.

## Writing Tests

### E2E Tests

E2E tests are standalone TypeScript scripts that demonstrate API usage with real examples.

**Example**:

```typescript
import { E2ETestRunner, assert } from '../helpers/e2e-test-runner';
import { createLedgerJsonApiClient } from '../helpers/test-clients';

async function main(): Promise<void> {
  const runner = new E2ETestRunner('My API Test');
  const client = createLedgerJsonApiClient();

  await runner.runTest('Should call API successfully', async () => {
    const response = await client.myMethod();
    assert.isDefined(response);
    assert.hasProperty(response, 'expectedField');
  });

  runner.printSummary();
  runner.exit();
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
```

### Best Practices

1. **Focus on Happy Paths**: Test valid inputs and expected outputs
2. **Keep Tests Simple**: Each test should be easy to understand
3. **Validate Structure, Not Values**: Check types and ranges, not exact values
4. **Document Expected Responses**: Include example responses in test documentation
5. **Log Key Information**: Help users understand what the test is doing

See [test/e2e/README.md](../test/e2e/README.md) for complete E2E testing documentation.

## Troubleshooting

### Tests Fail with "Connection Refused"

**Cause**: LocalNet is not running or not ready.

**Fix**:

```bash
# Check if services are running
npm run localnet:status

# Restart if needed
npm run localnet:stop
npm run localnet:start

# Wait for services to be ready
sleep 30
```

### Tests Fail with "Authentication Failed"

**Cause**: OAuth2 authentication is not working.

**Fix**:

```bash
# Verify Keycloak is accessible
curl http://localhost:8082/realms/AppProvider

# Check service logs
cd cn-quickstart/quickstart
make logs
```

### Services Won't Start

**Cause**: Docker containers are unhealthy or ports are in use.

**Fix**:

```bash
# Stop all containers
npm run localnet:stop

# Check for port conflicts
lsof -i :8082  # Keycloak
lsof -i :39750 # JSON API
lsof -i :39030 # Validator API

# Restart Docker if needed
docker system prune -f
npm run localnet:start
```

### Tests Timeout

**Cause**: Services are slow to respond or overloaded.

**Fix**:

- Wait longer for services to fully start
- Check system resources (CPU, memory)
- Check Docker container health: `docker ps`
- Reduce test concurrency

## Additional Resources

- [CN-Quickstart Integration Tests README](../test/integration/quickstart/README.md)
- [E2E Tests README](../test/e2e/README.md)
- [Contributing Guide](../CONTRIBUTING.md)
- [Main README](../README.md)
