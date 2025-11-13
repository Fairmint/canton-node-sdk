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

The SDK includes comprehensive integration testing against a local Splice network (LocalNet). See
the [LocalNet Testing Guide](./docs/LOCALNET_TESTING.md) for detailed instructions.

We also provide integration tests following the [cn-quickstart](https://github.com/digital-asset/cn-quickstart) approach.
See [test/integration/quickstart/README.md](./test/integration/quickstart/README.md) for details.

### Quick Start

```bash
# Setup CN-Quickstart LocalNet (recommended)
npm run localnet:quickstart

# Set environment variables (shown by setup script)
export LOCALNET_DIR="/tmp/cn-quickstart/quickstart/docker/modules/localnet"
export IMAGE_TAG="0.4.17"

# Configure SDK environment
cp example.env.localnet .env

# Start LocalNet
npm run localnet:start

# Run regression tests
npm run test:regression

# Or run quickstart-style integration tests
npm run test:integration

# Stop LocalNet
npm run localnet:stop
```

### Available Commands

- `npm run localnet:quickstart` - Setup CN-Quickstart LocalNet (recommended)
- `npm run localnet:setup` - Download and setup Splice LocalNet (alternative)
- `npm run localnet:start` - Start LocalNet services
- `npm run localnet:stop` - Stop LocalNet services
- `npm run localnet:status` - Check LocalNet status
- `npm run test:integration` - Run quickstart-style integration tests
- `npm run test:localnet` - Run tests against LocalNet
- `npm run test:regression` - Alias for test:localnet

## CI/CD

The project uses CircleCI for continuous integration:

- **Unit Tests**: Run on every commit
- **Linting**: Code quality checks on every commit
- **Integration Tests**: LocalNet regression tests on every commit
- **Nightly Regression**: Scheduled daily tests at 2 AM UTC

See [.circleci/config.yml](./.circleci/config.yml) for the complete CI configuration.
