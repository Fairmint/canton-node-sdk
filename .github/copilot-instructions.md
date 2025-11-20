# GitHub Copilot Instructions

This file provides guidance to GitHub Copilot when working with code in this repository.

## Project Overview

This is a TypeScript SDK for interacting with Canton blockchain nodes. The SDK provides type-safe
clients for various Canton APIs including Ledger JSON API, Participant Admin API, and more.

## Key Commands

### Build Commands

- `npm run build` - Full build (includes linting and TypeScript compilation)
- `npm run build:core` - Generate client methods, OpenAPI types, and compile TypeScript
- `npm run clean` - Remove build directory

### Test Commands

- `npm test` - Run unit tests (excludes integration tests)
- `npm run test:watch` - Run tests in watch mode
- `npm run test:integration` - Run quickstart-style integration tests
- `npm run test:localnet` - Run tests against LocalNet
- `npm run test:regression` - Alias for test:localnet
- `npm run simulate` - Run API simulation tests

### Lint and Format Commands

- `npm run lint` - Run ESLint
- `npm run lint:fix` - Run ESLint with auto-fix
- `npm run format` - Check Prettier formatting
- `npm run format:fix` - Apply Prettier formatting
- `npm run fix` - Run both lint:fix and format:fix

### Development Workflow

After making code changes, always run:

```bash
npm run lint && npm run build && npm test
```

## Architecture Patterns

### Client Architecture

- Clients are exported from `src/clients/register.ts`
- Direct instantiation pattern: `new LedgerJsonApiClient(config)`
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

## Coding Standards

### TypeScript Strictness

The project uses very strict TypeScript settings:

- `noImplicitAny`, `noImplicitReturns`, `noImplicitThis` are enabled
- `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess` for extra safety
- Always provide explicit return types for functions
- Avoid using `any` type

### Code Style

- Use Prettier for formatting (configured in `.prettierrc`)
- Follow ESLint rules (configured in `eslint.config.mjs`)
- Use TypeScript strict mode
- Write comprehensive JSDoc comments for public APIs

### Testing

1. **Unit Tests** (`/test`) - Jest tests for individual components
2. **Simulation Tests** (`/simulations`) - API response simulations
3. **Integration Tests** (`/test/integration`) - End-to-end testing with real APIs

Test configuration:

- Jest config in `jest.config.js`
- Test setup in `test/setup.ts` loads `.env.test`
- 30-second timeout for async operations

### Adding New API Clients

1. Add OpenAPI spec to `specs/` directory
2. Run `npm run generate:openapi-types` to generate types
3. Create client class extending `BaseClient` or `SimpleBaseClient`
4. Implement operations in `operations/` subdirectory
5. Export client from `src/clients/register.ts`
6. Add appropriate environment variable configuration

### Environment Variables

- Development: Copy `example.env` to `.env`
- Testing: Uses `.env.test` for test-specific config
- Required variables depend on which APIs you're using
- Use `EnvLoader.get()` to access environment variables in code

## LocalNet Testing

The SDK includes comprehensive integration testing against a local Splice network (LocalNet):

```bash
# Setup CN-Quickstart LocalNet (recommended)
npm run localnet:quickstart

# Configure SDK environment
cp example.env.localnet .env

# Start LocalNet
npm run localnet:start

# Run regression tests
npm run test:regression

# Stop LocalNet
npm run localnet:stop
```

## Project Structure

```
src/
  clients/          - API client implementations
    */operations/   - API operation implementations
    */generated/    - Generated client methods
    register.ts     - Client registration and exports
  core/             - Core utilities and base classes
  errors/           - Error class definitions
test/               - Unit tests
  integration/      - Integration tests
simulations/        - API simulation tests
specs/              - OpenAPI specifications
docs/               - Documentation site
scripts/            - Build and utility scripts
```

## Documentation

- Full documentation site: https://sdk.canton.fairmint.com/
- External signing guide: [docs/EXTERNAL_SIGNING.md](../docs/EXTERNAL_SIGNING.md)
- LocalNet testing: [docs/LOCALNET_TESTING.md](../docs/LOCALNET_TESTING.md)
- Contributing: [CONTRIBUTING.md](../CONTRIBUTING.md)

## CI/CD

The project uses CircleCI for continuous integration:

- **Unit Tests**: Run on every commit
- **Linting**: Code quality checks on every commit
- **Integration Tests**: LocalNet regression tests on every commit
- **Nightly Regression**: Scheduled daily tests at 2 AM UTC
- **Publishing**: Automatic on push to main branch (increments patch version)

## Common Tasks

### Running a Specific Test

```bash
npm test path/to/test.spec.ts
npm test -- --testNamePattern="pattern"
```

### Debugging Tests

```bash
npm run test:watch
```

### Building Documentation

```bash
npm run docs:build
npm run docs:dev  # with live reload
```

### Working with LocalNet

```bash
npm run localnet:status  # Check LocalNet status
npm run localnet:start   # Start LocalNet services
npm run localnet:stop    # Stop LocalNet services
```

## Dependencies

Key dependencies:

- `@canton-network/wallet-sdk` - Canton wallet functionality
- `@stellar/stellar-base` - Stellar blockchain integration
- `axios` - HTTP client
- `openapi-fetch` / `openapi-typescript` - OpenAPI client generation
- `ws` - WebSocket support
- `zod` - Schema validation

Development dependencies include TypeScript, Jest, ESLint, Prettier, and various plugins for code
quality.
