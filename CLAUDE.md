# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this
repository.

## Context

Read `llms.txt` first for the repo’s source-of-truth context and documentation links.

## Commands

### Build Commands

- `npm run build` - Full build (includes linting and TypeScript compilation)
- `npm run build:core` - Generate client methods, OpenAPI types, and compile TypeScript
- `npm run clean` - Remove build directory

### Test Commands

- `npm test` - Run unit tests
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Run tests with coverage report

### Lint Commands

- `npm run lint` - Run all linting (ESLint + Prettier + npm package lint)
- `npm run lint:check` - Check linting without auto-fixing
- `npm run lint:eslint` - Run ESLint with auto-fix
- `npm run lint:prettier` - Run Prettier formatting

### Development Workflow

After making code changes, always run: `npm run lint && npm run build && npm test`

## Architecture Overview

This is a TypeScript SDK for interacting with Canton blockchain nodes. It uses several key
architectural patterns:

### Client Architecture

- Clients are exported directly from `src/clients/register.ts`
- Direct instantiation: `new LedgerJsonApiClient(config)`
- Type-safe client instantiation with automatic configuration

### Base Client Hierarchy

- `BaseClient` - Full-featured clients with OAuth2 authentication
- `SimpleBaseClient` - Simplified clients for APIs without auth (e.g., Lighthouse)
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
- Supports client_credentials and password grant types
- Automatic token refresh and bearer token injection

### Code Generation

- OpenAPI specs in `specs/` directory
- `npm run generate:openapi` generates TypeScript types
- `npm run generate:client-methods` creates client method files
- Generated files go in `src/clients/*/generated/`

### Error Handling

Custom error hierarchy:

- `CantonError` - Base error class
- `ConfigurationError` - Missing/invalid configuration
- `AuthenticationError` - Auth failures
- `ApiError` - API request failures
- `ValidationError` - Data validation errors
- `NetworkError` - Network connectivity issues

## Testing Strategy

### Test Types

1. **Unit Tests** (`/test`) - Jest tests for individual components
2. **Integration Tests** - End-to-end testing with real APIs

### Running Specific Tests

- Run a single test file: `npm test path/to/test.spec.ts`
- Run tests matching a pattern: `npm test -- --testNamePattern="pattern"`
- Debug tests: `npm run test:watch`

### Test Configuration

- Jest config in `jest.config.js`
- Test setup in `test/setup.ts` loads `.env.test`
- 30-second timeout for async operations

## Development Guidelines

### TypeScript Strictness

The project uses very strict TypeScript settings:

- `noImplicitAny`, `noImplicitReturns`, `noImplicitThis` are enabled
- `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess` for extra safety
- Always provide explicit return types for functions
- Avoid using `any` type

### Adding New API Clients

1. Add OpenAPI spec to `specs/` directory
2. Run `npm run generate:openapi` to generate types
3. Create client class extending `BaseClient` or `SimpleBaseClient`
4. Implement operations in `operations/` subdirectory
5. Export client from `src/clients/register.ts`
6. Add appropriate environment variable configuration

### Environment Variables

- Development: Copy `.env.example` to `.env`
- Testing: Uses `.env.test` for test-specific config
- Required variables depend on which APIs you're using
- Use `EnvLoader.get()` to access environment variables in code
