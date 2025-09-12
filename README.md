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
console.log(`Connected to Canton ${version.version}`);
```

## For Contributors

See [CONTRIBUTING.md](./CONTRIBUTING.md) for information about setting up the development
environment.

## LocalNet Integration Test Setup

This repository includes an integration test that verifies connectivity to a local Canton JSON Ledger API by calling `/v2/version`.

### Prerequisites
- Docker Desktop (allocate ≥ 8GB RAM)
- curl, direnv, nix
- Access to Digital Asset JFrog artifacts (for Quickstart images)

### Install and Start Canton LocalNet (CN Quickstart)
Follow the official guide to install and run the Canton Network Quickstart. Reference:
`https://docs.digitalasset.com/build/3.3/quickstart/download/cnqs-installation.html`

Summary of steps:
1. Clone and allow direnv
   ```bash
   git clone https://github.com/digital-asset/cn-quickstart.git
   cd cn-quickstart
   direnv allow
   ```
2. Configure JFrog credentials in `~/.netrc` and verify connectivity
   ```bash
   cat > ~/.netrc <<'EOF'
   machine digitalasset.jfrog.io
   login <your_email@example.com>
   password <identity_token>
   EOF
   chmod 600 ~/.netrc
   curl -v --netrc "https://digitalasset.jfrog.io/artifactory/api/system/ping"
   ```
3. Docker login
   ```bash
   docker login digitalasset-docker.jfrog.io
   docker login
   ```
4. Install Daml SDK and start LocalNet
   ```bash
   cd quickstart
   make install-daml-sdk
   make build
   make start
   ```

By default, the JSON Ledger API is commonly exposed at `http://localhost:8080`. If unsure, run:
```bash
docker compose port json-api 8080
```

### Run the LocalNet integration test
Use a Node.js version compatible with Jest 30 (Node 20/22 recommended):
```bash
nvm install 22 && nvm use 22 # optional if using nvm
```

Set the base URL and run the test from this package directory:
```bash
export CANTON_LOCALNET_LEDGER_JSON_API_URI=http://localhost:8080
npm run test:localnet
```

This executes `test/integration/localnet.version.test.ts`, which calls `LedgerJsonApiClient().getVersion()` and asserts the response shape. If it fails, ensure LocalNet is running and the URL is correct.
