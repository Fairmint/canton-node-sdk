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

### Reproducing CI Locally

Our `.github/workflows/test-cn-quickstart.yml` job is the source of truth for lint/build/test. To
mirror it locally:

1. `npm install`
2. `git submodule update --init --depth 1 libs/splice libs/cn-quickstart`
3. Inside `libs/cn-quickstart/quickstart`: run `echo 2 | make setup`, then `make install-daml-sdk`,
   add `~/.daml/bin` to your `PATH`, and run `make start` (requires Docker + Compose)
4. In the repo root: `npm run build && npm test`

> ℹ️ Run `npm run lint` before cloning submodules (or pass `--ignore-pattern 'libs/splice/**'`
> etc.) to avoid ESLint parsing files outside this SDK.

## Testing with LocalNet

Integration tests target the CN-Quickstart LocalNet described above. Bring it up via `make start` in
`libs/cn-quickstart/quickstart`, then run `npm test` from the repo root to execute the suites.

We also provide integration tests following the
[cn-quickstart](https://github.com/digital-asset/cn-quickstart) approach. See
[test/integration/quickstart/README.md](./test/integration/quickstart/README.md) for details.

### Quick Start

```bash
# Setup CN-Quickstart LocalNet (recommended)
npm run localnet:quickstart

# Environment variables are written to .env.localnet
cat .env.localnet

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

> ℹ️ If you run `npm run localnet:setup` instead of the quickstart, make sure you have a
> `GITHUB_TOKEN` (or `SPLICE_GITHUB_TOKEN`) with read access to the Splice releases exported so the
> bundle download can succeed.

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
