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

# Run a fast localnet endpoint smoke check
npm run localnet:smoke

# Run integration tests
npm run test:integration

# Stop localnet
npm run localnet:stop
```

### Use LocalNet tooling from other repos

You can reuse this LocalNet workflow from another repository by installing this package and calling
the bundled shell scripts.

```bash
# In your other repo
npm install --save-dev @fairmint/canton-node-sdk

# Run bundled localnet script directly
bash ./node_modules/@fairmint/canton-node-sdk/scripts/localnet/localnet-cloud.sh verify
```

Or wire it into your other repo's `package.json`:

```json
{
  "scripts": {
    "localnet:setup": "bash ./node_modules/@fairmint/canton-node-sdk/scripts/localnet/setup-localnet.sh",
    "localnet:start": "bash ./node_modules/@fairmint/canton-node-sdk/scripts/localnet/start-localnet.sh",
    "localnet:status": "bash ./node_modules/@fairmint/canton-node-sdk/scripts/localnet/localnet-status.sh",
    "localnet:smoke": "bash ./node_modules/@fairmint/canton-node-sdk/scripts/localnet/localnet-cloud.sh smoke",
    "localnet:test": "bash ./node_modules/@fairmint/canton-node-sdk/scripts/localnet/localnet-cloud.sh test",
    "localnet:stop": "bash ./node_modules/@fairmint/canton-node-sdk/scripts/localnet/stop-localnet.sh"
  }
}
```

The npm package includes the LocalNet helper scripts and required cn-quickstart resources so other
repos can use the same setup without copying files.

`localnet-cloud.sh test` runs `test:integration` or `test:localnet` from your repo when those
scripts exist. If no integration test script is configured, it skips that step.

### Available Commands

- `npm run localnet:quickstart` - One-time localnet setup for this machine
- `npm run localnet:setup` - Alias for `localnet:quickstart`
- `npm run localnet:start` - Start localnet and wait for readiness
- `npm run localnet:status` - Show container and endpoint status
- `npm run localnet:smoke` - Run localnet endpoint smoke checks
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
