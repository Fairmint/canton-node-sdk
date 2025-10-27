# Canton Node SDK

A TypeScript SDK for interacting with Canton blockchain nodes.

## 📚 Documentation

**For complete documentation, examples, and API references, visit:**
**[https://sdk.canton.fairmint.com/](https://sdk.canton.fairmint.com/)**

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

### Quick Start

```bash
# Setup LocalNet
npm run localnet:setup

# Set environment variables (shown by setup script)
export LOCALNET_DIR="/tmp/splice-localnet/splice-node/docker-compose/localnet"
export IMAGE_TAG="0.4.22"

# Start LocalNet
npm run localnet:start

# Run regression tests
npm run test:regression

# Stop LocalNet
npm run localnet:stop
```

### Available Commands

- `npm run localnet:setup` - Download and setup LocalNet
- `npm run localnet:start` - Start LocalNet services
- `npm run localnet:stop` - Stop LocalNet services
- `npm run localnet:status` - Check LocalNet status
- `npm run test:localnet` - Run tests against LocalNet
- `npm run test:regression` - Alias for test:localnet

## CI/CD

The project uses CircleCI for continuous integration:

- **Unit Tests**: Run on every commit
- **Linting**: Code quality checks on every commit
- **Integration Tests**: LocalNet regression tests on every commit
- **Nightly Regression**: Scheduled daily tests at 2 AM UTC

See [.circleci/config.yml](./.circleci/config.yml) for the complete CI configuration.
