# Canton Node SDK

A TypeScript SDK for interacting with Canton blockchain nodes.

## 📚 Documentation

**For complete documentation, examples, and API references, visit:**
**[https://sdk.canton.fairmint.com/](https://sdk.canton.fairmint.com/)**

### Specialized Guides

- 🔐 **[External Signing Guide](docs/EXTERNAL_SIGNING.md)** - Create and manage external parties
  with user-controlled private keys

## Quick Start

```bash
npm install @fairmint/canton-node-sdk
```

```typescript
import { LedgerJsonApiClient } from '@fairmint/canton-node-sdk';

const client = new LedgerJsonApiClient(config);
const version = await client.getVersion();
```

## For Contributors

See [CONTRIBUTING.md](./CONTRIBUTING.md) for information about setting up the development
environment.

## Testing with LocalNet

The SDK integration suite targets a local cn-quickstart network. For full setup and troubleshooting,
see [docs/LOCALNET_TESTING.md](./docs/LOCALNET_TESTING.md).

### Quick Start

```bash
# One-time setup (submodules, Docker prerequisites, quickstart config, Daml SDK)
npm run localnet:quickstart

# Start localnet and wait for ready endpoints
npm run localnet:start

# Run a fast SDK smoke check script
npm run localnet:smoke

# Run integration tests
npm run test:integration

# Stop localnet
npm run localnet:stop
```

### Available Commands

- `npm run localnet:quickstart` - One-time localnet setup for this machine
- `npm run localnet:setup` - Alias for `localnet:quickstart`
- `npm run localnet:start` - Start localnet and wait for readiness
- `npm run localnet:status` - Show container and endpoint status
- `npm run localnet:smoke` - Run SDK connectivity smoke script
- `npm run localnet:stop` - Stop localnet services
- `npm run localnet:verify` - Setup + start + smoke + integration tests
- `npm run test:integration` - Run localnet integration tests
- `npm run test:localnet` - Alias for `test:integration`
- `npm run test:regression` - Alias for `test:integration`

## CI/CD

The project uses GitHub Actions for continuous integration:

- **Unit Tests**: Run on every commit
- **Linting**: Code quality checks on every commit
- **Integration Tests**: LocalNet regression tests (cn-quickstart)
- **Publish**: Automatic NPM publishing on merge to main

See [.github/workflows/](./.github/workflows/) for CI configurations.
