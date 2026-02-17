# LocalNet Testing Guide

This repository uses [cn-quickstart](https://github.com/digital-asset/cn-quickstart) for integration
tests.

The scripts in `scripts/localnet/localnet-cloud.sh` are tuned for this cloud environment:

- Install Docker when missing
- Switch iptables to `legacy` mode (required here)
- Start Docker daemon with `vfs` storage driver
- Initialize submodules
- Configure cn-quickstart with OAuth2
- Ensure host aliases (`scan.localhost`, `sv.localhost`, `wallet.localhost`)

## First-Time Setup

```bash
npm install
npm run localnet:quickstart
```

## Standard Workflow

```bash
# Start localnet
npm run localnet:start

# Check status at any time
npm run localnet:status

# Run a smoke script against localnet
npm run localnet:smoke

# Run integration tests
npm run test:integration

# Stop localnet when done
npm run localnet:stop
```

One-shot verification:

```bash
npm run localnet:verify
```

## Startup Modes

`npm run localnet:start` now uses a fast path by default:

- If quickstart build artifacts are already present, it skips rebuilding quickstart and runs compose
  startup directly.
- If artifacts are missing (or fast start fails), it automatically falls back to full `make start`.

Force a full rebuild start:

```bash
CANTON_LOCALNET_FORCE_FULL_START=true npm run localnet:start
```

Disable fast startup explicitly:

```bash
CANTON_LOCALNET_FAST_START=false npm run localnet:start
```

## Running Quick Custom Scripts

Create a script and run it with `tsx`:

```bash
mkdir -p scripts/localnet
cat > scripts/localnet/check.ts <<'TS'
import { LedgerJsonApiClient } from '../../src';

async function main(): Promise<void> {
  const client = new LedgerJsonApiClient({ network: 'localnet' });
  const version = await client.getVersion();
  console.log(version.version);
}

void main();
TS

npx tsx scripts/localnet/check.ts
```

Use `npm run localnet:start` first so the script has a running network.

## Before Pushing

Run the standard quality gates plus localnet integration tests:

```bash
npm run lint && npm run build && npm test
npm run test:integration
```

## Troubleshooting

- Docker daemon logs: `/tmp/localnet-dockerd.log`
- If hostname routing fails, re-run: `npm run localnet:start` (it reapplies `/etc/hosts`)
- If quickstart setup changed, rerun: `npm run localnet:quickstart`
