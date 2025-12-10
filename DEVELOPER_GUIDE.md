# Developer Guide

This guide provides comprehensive information for developers working on the Canton Node SDK.

## Table of Contents

- [Getting Started](#getting-started)
- [Development Environment Setup](#development-environment-setup)
- [Building the Project](#building-the-project)
- [Testing](#testing)
- [Code Style & Guidelines](#code-style--guidelines)
- [Architecture Overview](#architecture-overview)
- [Common Development Tasks](#common-development-tasks)
- [Contributing](#contributing)
- [Troubleshooting](#troubleshooting)

## Getting Started

### Prerequisites

- **Node.js**: >= 18.0.0
- **npm**: Latest version
- **Git**: For version control

### Installation

```bash
# Clone the repository
git clone https://github.com/Fairmint/canton-node-sdk.git
cd canton-node-sdk

# Install dependencies
npm install
```

## Development Environment Setup

### Environment Configuration

1. Copy the example environment file:
   ```bash
   cp example.env .env
   ```

2. Update `.env` with your configuration:
   - Set `CANTON_CURRENT_NETWORK` (devnet/testnet/mainnet)
   - Set `CANTON_CURRENT_PROVIDER` (e.g., `5n`)
   - Configure API URIs and authentication credentials
   - See `example.env` for all available configuration options

### Configuration Pattern

Environment variables follow this pattern:
```
CANTON_{NETWORK}_{PROVIDER}_{SETTING}
```

Example:
```
CANTON_TESTNET_BNS_LEDGER_API_URL
CANTON_DEVNET_5N_LEDGER_JSON_API_CLIENT_ID
```

### Authentication Methods

The SDK supports two OAuth2 authentication methods:

1. **Client Credentials** (machine-to-machine):
   - `CLIENT_ID` + `CLIENT_SECRET`

2. **Password Grant** (user authentication):
   - `CLIENT_ID` + `USERNAME` + `PASSWORD`

## Building the Project

### Build Commands

```bash
# Full build (includes linting and TypeScript compilation)
npm run build

# Core build (generates client methods, OpenAPI types, compiles TypeScript)
npm run build:core

# Clean build directory
npm run clean
```

### Build Process

The build process includes:

1. **Code Generation**:
   - Generate OpenAPI types: `npm run generate:openapi-types`
   - Generate client methods: `npm run build:core:generate-client-methods`

2. **TypeScript Compilation**:
   - Compiles `src/` to `build/src/`
   - Generates type declarations (`.d.ts` files)
   - Generates source maps

3. **Linting**:
   - TypeScript strict type checking
   - ESLint code quality checks

### Development Workflow

After making code changes, always run:
```bash
npm run lint && npm run build && npm test
```

## Testing

### Test Commands

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage

# Run a specific test file
npm test path/to/test.spec.ts

# Run tests matching a pattern
npm test -- --testNamePattern="pattern"
```

### Test Types

1. **Unit Tests** (`test/unit/`):
   - Jest tests for individual components
   - Fast execution, isolated testing

2. **Integration Tests** (`test/integration/`):
   - End-to-end testing with real APIs
   - Tests against LocalNet or remote networks

### Test Configuration

- **Jest Config**: `jest.config.js`
- **Test Setup**: `test/setup.ts` loads `.env.test`
- **Timeout**: 30 seconds for async operations

### LocalNet Testing

The SDK includes comprehensive integration testing against a local Splice network:

```bash
# Setup CN-Quickstart LocalNet (recommended)
npm run localnet:quickstart

# Start LocalNet
npm run localnet:start

# Run regression tests
npm run test:regression

# Stop LocalNet
npm run localnet:stop
```

See the [README.md](./README.md) for more LocalNet testing details.

## Code Style & Guidelines

### TypeScript Strictness

The project uses very strict TypeScript settings:

- `noImplicitAny` - No implicit `any` types
- `noImplicitReturns` - All code paths must return
- `noImplicitThis` - Explicit `this` binding
- `exactOptionalPropertyTypes` - Strict optional properties
- `noUncheckedIndexedAccess` - Safe array/object access
- `noPropertyAccessFromIndexSignature` - Explicit property access

### Type Safety Rules

**Strict types are mandatory:**

- Always use explicit return types
- Never use `any` or `unknown` unless absolutely necessary
- If you think you need `any`, investigate and fix the root cause:
  - Upstream types missing/incorrect? Add or fix them
  - Invalid usage or design? Correct the code
  - Third-party types wrong? Augment types or contribute a fix
- Do not silence type errors with broad assertions (e.g., `as any`)

### Code Style

- **Keep it brief**: No verbose write-ups or lengthy comments
- **Focus on the future**: Don't include comments about old code
- **Prefer comments in files** over README docs unless discussing concepts spanning multiple files

### Linting

```bash
# Run all linting (ESLint + Prettier + npm package lint)
npm run lint

# Auto-fix linting issues
npm run lint:fix

# Format code with Prettier
npm run format:fix
```

### Pre-commit Checks

Before committing, ensure:
- All linting passes: `npm run lint`
- Build succeeds: `npm run build`
- Tests pass: `npm test`
- Type checking passes: `tsc --noEmit`

## Architecture Overview

### Client Architecture

- Clients are exported directly from `src/clients/register.ts`
- Direct instantiation: `new LedgerJsonApiClient(config)`
- Type-safe client instantiation with automatic configuration

### Base Client Hierarchy

- **`BaseClient`**: Full-featured clients with OAuth2 authentication
- **`SimpleBaseClient`**: Simplified clients for APIs without auth (e.g., Lighthouse)
- All API clients extend one of these base classes

### Operation Pattern

- `ApiOperation` and `SimpleApiOperation` abstract classes define the structure for API operations
- Each API endpoint is implemented as a class extending the appropriate operation base
- Operations are organized in directories like `src/clients/*/operations/`

### Configuration Management

- `EnvLoader` singleton manages environment variables
- Supports multiple networks (devnet/testnet/mainnet) and providers
- Configuration pattern: `CANTON_{NETWORK}_{PROVIDER}_{SETTING}`
- Example: `CANTON_TESTNET_BNS_LEDGER_API_URL`

### Authentication

- `AuthenticationManager` handles OAuth2 token management
- Supports `client_credentials` and `password` grant types
- Automatic token refresh and bearer token injection

### Code Generation

- OpenAPI specs in `specs/` directory
- `npm run generate:openapi-types` generates TypeScript types
- `npm run build:core:generate-client-methods` creates client method files
- Generated files go in `src/clients/*/generated/`

### Error Handling

Custom error hierarchy:

- `CantonError` - Base error class
- `ConfigurationError` - Missing/invalid configuration
- `AuthenticationError` - Auth failures
- `ApiError` - API request failures
- `ValidationError` - Data validation errors
- `NetworkError` - Network connectivity issues

## Common Development Tasks

### Adding a New API Client

1. Add OpenAPI spec to `specs/` directory
2. Run `npm run generate:openapi-types` to generate types
3. Create client class extending `BaseClient` or `SimpleBaseClient`
4. Implement operations in `operations/` subdirectory
5. Export client from `src/clients/register.ts`
6. Add appropriate environment variable configuration

### Adding a New Operation

1. Create a new class extending `ApiOperation` or `SimpleApiOperation`
2. Implement required methods:
   - `getPath()` - API endpoint path
   - `getMethod()` - HTTP method
   - `getRequestSchema()` - Request validation schema (optional)
   - `getResponseSchema()` - Response validation schema (optional)
3. Add the operation to the appropriate client's operations directory
4. Export from the client's index file

### Updating OpenAPI Types

1. Update the OpenAPI spec file in `specs/`
2. Run `npm run generate:openapi-types`
3. Review generated types in `src/clients/*/generated/`
4. Update client methods if needed: `npm run build:core:generate-client-methods`

### Generating Documentation

```bash
# Generate operation documentation
npm run docs

# Build documentation site
npm run docs:build

# Serve documentation locally
npm run docs:dev
```

### Preparing a Release

```bash
# Prepare release (updates version, changelog, etc.)
npm run prepare-release
```

## Contributing

### Publishing

This package is automatically published via CI/CD when changes are pushed to the main branch. The publishing workflow:

1. Runs on every push to the `main` branch
2. Automatically increments the patch version
3. Publishes to GitHub Packages
4. Creates a git tag for the release

**No manual publishing required.**

### CI/CD

The project uses GitHub Actions for continuous integration:

- **Publishing**: Automatic publishing to NPM on pushes to `main`
- **Documentation**: Automatic deployment to GitHub Pages
- **Integration Tests**: LocalNet regression tests via `test-cn-quickstart.yml` workflow

See `.github/workflows/` for the complete CI configuration.

### Pull Request Process

1. Create a feature branch from `main`
2. Make your changes following the code style guidelines
3. Ensure all tests pass: `npm run lint && npm run build && npm test`
4. Create a pull request
5. CI will automatically run tests and linting
6. After approval and merge, the package will be automatically published

## Troubleshooting

### Build Issues

**Problem**: TypeScript compilation errors
- **Solution**: Run `tsc --noEmit` to see detailed type errors
- Check that all types are properly defined
- Ensure no `any` types are used

**Problem**: Missing generated files
- **Solution**: Run `npm run build:core` to regenerate client methods and types

### Test Issues

**Problem**: Tests fail with timeout errors
- **Solution**: Check network connectivity
- Verify environment variables in `.env.test` are correct
- Increase timeout in `jest.config.js` if needed

**Problem**: LocalNet tests fail
- **Solution**: Ensure LocalNet is running: `npm run localnet:status`
- Restart LocalNet: `npm run localnet:stop && npm run localnet:start`
- Check LocalNet logs for errors

### Environment Configuration

**Problem**: Authentication errors
- **Solution**: Verify OAuth credentials in `.env`
- Check that `CLIENT_ID` and `CLIENT_SECRET` are correct
- Ensure the correct grant type is configured

**Problem**: Configuration not found errors
- **Solution**: Verify environment variable naming follows the pattern: `CANTON_{NETWORK}_{PROVIDER}_{SETTING}`
- Check that `CANTON_CURRENT_NETWORK` and `CANTON_CURRENT_PROVIDER` are set correctly

### Type Errors

**Problem**: Type errors after updating dependencies
- **Solution**: Run `npm run generate:openapi-types` to regenerate types
- Check for breaking changes in dependency versions
- Review TypeScript compiler errors: `tsc --noEmit`

## Additional Resources

- **Main Documentation**: [https://sdk.canton.fairmint.com/](https://sdk.canton.fairmint.com/)
- **External Signing Guide**: [docs/EXTERNAL_SIGNING.md](./docs/EXTERNAL_SIGNING.md)
- **Repository**: [https://github.com/Fairmint/canton-node-sdk](https://github.com/Fairmint/canton-node-sdk)
- **Issues**: [https://github.com/Fairmint/canton-node-sdk/issues](https://github.com/Fairmint/canton-node-sdk/issues)
