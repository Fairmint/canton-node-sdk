# LocalNet Testing Guide

This guide explains how to run the Canton Node SDK regression tests against a local Splice LocalNet environment.

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Local Development Setup](#local-development-setup)
- [Running Tests](#running-tests)
- [CircleCI Integration](#circleci-integration)
- [Troubleshooting](#troubleshooting)

## Overview

LocalNet is a Docker Compose-based local deployment of the Splice network that provides:

- **3 Validator Nodes:**
  - **app-provider**: For application providers
  - **app-user**: For end users
  - **sv**: Super validator node

- **PostgreSQL Database**: Shared database for all components
- **Web Applications**: Wallet UI, SV UI, and Scan UI
- **API Endpoints**: JSON Ledger API, Validator API, and Scan API

LocalNet is designed for development and testing, not production use.

## Prerequisites

### Local Development

- **Docker** and **Docker Compose**: For running LocalNet containers
- **Node.js 18+**: For running the SDK and tests
- **Bash**: For running setup scripts
- **curl** or **wget**: For downloading the Splice bundle

### CircleCI

The CircleCI configuration handles all prerequisites automatically using the `ubuntu-machine` executor with Docker support.

## Local Development Setup

### Step 1: Download and Setup LocalNet

Run the setup script to download and extract the Splice LocalNet bundle:

```bash
npm run localnet:setup
```

This will:
1. Download the Splice LocalNet bundle (version 0.4.22 by default)
2. Extract it to `/tmp/splice-localnet/`
3. Display instructions for setting environment variables

### Step 2: Set Environment Variables

Add these to your shell profile (`~/.bashrc`, `~/.zshrc`, etc.):

```bash
export LOCALNET_DIR="/tmp/splice-localnet/splice-node/docker-compose/localnet"
export IMAGE_TAG="0.4.22"
```

Then reload your shell:

```bash
source ~/.bashrc  # or source ~/.zshrc
```

### Step 3: Start LocalNet

Start all LocalNet services:

```bash
npm run localnet:start
```

This will start:
- PostgreSQL database
- 3 validator nodes (sv, app-provider, app-user)
- Web UIs
- All required services

Wait for services to be ready (approximately 30-60 seconds).

### Step 4: Configure Environment

Copy the LocalNet environment template:

```bash
cp example.env.localnet .env
```

**Important:** You may need to discover and update the following values in `.env`:

- `CANTON_LOCALNET_APP_PROVIDER_PARTY_ID`: Party ID for app-provider
- `CANTON_VALIDATOR_WALLET_APP_INSTALL_CONTRACT_ID_LOCALNET`: Wallet app install contract ID

You can discover these by:
- Accessing the Canton Console: See [Canton Console](#canton-console) section
- Using the Wallet UI: [http://wallet.localhost:3000](http://wallet.localhost:3000)
- Checking the Scan UI: [http://scan.localhost:4000](http://scan.localhost:4000)

### Step 5: Check Status

Verify that LocalNet is running correctly:

```bash
npm run localnet:status
```

This will check:
- Container status
- Health of JSON API endpoints
- Availability of web UIs

## Running Tests

### Run All Regression Tests

```bash
npm run test:regression
```

This will:
1. Build the SDK
2. Run all simulations against LocalNet
3. Save results to `simulations/results/`

### Run Individual Simulations

```bash
npm run simulate
```

### View Test Results

Test results are saved as JSON files in:

```
simulations/results/
├── ledger-json-api/
│   └── v2/
│       ├── version/
│       ├── packages/
│       └── updates/
└── validator-api/
    └── registry/
```

### Stop LocalNet

When you're done testing:

```bash
npm run localnet:stop
```

This will stop and remove all LocalNet containers and volumes.

## CircleCI Integration

### Configuration

The CircleCI configuration is located at `.circleci/config.yml` and includes:

#### Jobs

1. **test**: Runs standard unit tests (no LocalNet)
2. **lint**: Runs linting and formatting checks
3. **test-localnet**: Runs regression tests against LocalNet

#### Workflows

1. **build-test**: Runs on every commit
   - Executes lint → test → test-localnet

2. **nightly-regression**: Scheduled regression tests
   - Runs at 2 AM UTC daily
   - Only on main/master branch

### How It Works

The `test-localnet` job:

1. **Setup**:
   - Installs Node.js using nvm
   - Installs npm dependencies

2. **LocalNet Setup**:
   - Downloads Splice bundle
   - Extracts to `/tmp/`
   - Sets environment variables

3. **Start LocalNet**:
   - Starts all Docker Compose services
   - Waits for services to be healthy (max 5 minutes)
   - Validates JSON API endpoints

4. **Run Tests**:
   - Creates LocalNet `.env` configuration
   - Builds SDK
   - Runs all simulations
   - Saves results as artifacts

5. **Cleanup**:
   - Shows logs on failure
   - Stops and removes all containers

### Environment Variables in CI

The CircleCI job creates a LocalNet-specific `.env` file with:

```bash
CANTON_CURRENT_NETWORK=localnet
CANTON_CURRENT_PROVIDER=app-provider
CANTON_LOCALNET_APP_PROVIDER_LEDGER_JSON_API_URI=http://localhost:39750
# ... and more
```

All authentication uses simple admin credentials (`admin:admin`) since LocalNet doesn't use real OAuth.

### Viewing CI Results

After a CI run:

1. **Test Results**: Available in the CircleCI Artifacts tab
   - Path: `simulation-results/`

2. **Logs**: Available in the job output
   - Successful tests show ✓ markers
   - Failed tests show detailed error messages

## Troubleshooting

### Services Not Starting

**Problem**: LocalNet containers fail to start

**Solutions**:
- Ensure Docker is running
- Check Docker resources (CPU/Memory)
- Verify ports are not already in use (39750, 29750, 49750, etc.)
- Check logs: `docker compose -f $LOCALNET_DIR/compose.yaml logs`

### Health Checks Failing

**Problem**: Health checks timeout in CI or locally

**Solutions**:
- Wait longer (services can take 1-2 minutes to be ready)
- Check specific service logs
- Verify network connectivity to localhost
- Try restarting LocalNet

### Tests Failing

**Problem**: Simulations fail with connection errors

**Solutions**:
- Verify `.env` configuration is correct
- Check that Party IDs are set correctly
- Ensure LocalNet is fully started: `npm run localnet:status`
- Check JSON API is responding: `curl http://localhost:39750/livez`

### Port Conflicts

**Problem**: "Port already in use" errors

**Solutions**:
- Stop other LocalNet instances: `npm run localnet:stop`
- Check for other services using the ports: `lsof -i :39750`
- Change LocalNet ports in `compose.env`

### Canton Console

To access the Canton Console for debugging:

```bash
docker compose \
  --env-file $LOCALNET_DIR/compose.env \
  --env-file $LOCALNET_DIR/env/common.env \
  -f $LOCALNET_DIR/compose.yaml \
  -f $LOCALNET_DIR/resource-constraints.yaml \
  run --rm console
```

Once in the console, you can:
- List parties: `app-provider.parties.list()`
- Check contracts: `app-provider.ledger_api.contracts.query()`
- Get admin token: `app-provider.adminToken`

## LocalNet URLs and Ports

### Web UIs

- **App User Wallet**: [http://wallet.localhost:2000](http://wallet.localhost:2000)
- **App Provider Wallet**: [http://wallet.localhost:3000](http://wallet.localhost:3000)
- **Super Validator UI**: [http://sv.localhost:4000](http://sv.localhost:4000)
- **Scan UI**: [http://scan.localhost:4000](http://scan.localhost:4000)

### JSON API Endpoints

- **App Provider**: `http://localhost:39750` (prefix: 3, port: 9750)
- **App User**: `http://localhost:29750` (prefix: 2, port: 9750)
- **Super Validator**: `http://localhost:49750` (prefix: 4, port: 9750)

### Validator API Endpoints

- **App Provider**: `http://localhost:39030` (prefix: 3, port: 9030)
- **App User**: `http://localhost:29030` (prefix: 2, port: 9030)
- **Super Validator**: `http://localhost:49030` (prefix: 4, port: 9030)

### Other Ports

- **Ledger API**: `{prefix}9010`
- **Admin API**: `{prefix}9020`
- **Healthcheck**: `{prefix}9000`
- **PostgreSQL**: `5432`

## Default Users

- **app-user**: Default user for app-user validator
- **app-provider**: Default user for app-provider validator
- **sv**: Default user for super validator

All users have the default password: `admin`

## Additional Resources

- [Splice Documentation](https://docs.dev.sync.global/app_dev/testing/localnet.html)
- [Canton Documentation](https://docs.daml.com/canton/index.html)
- [Canton Node SDK Documentation](https://sdk.canton.fairmint.com/)

## Notes

- **LocalNet rounds**: May take up to 6 rounds (one hour) to display in the Scan UI
- **Data persistence**: Stopped with `-v` flag removes all volumes (clean slate)
- **Resource usage**: LocalNet requires significant Docker resources (4GB+ RAM recommended)
- **localhost domains**: If `*.localhost` domains don't resolve, add entries to `/etc/hosts`:
  ```
  127.0.0.1   wallet.localhost
  127.0.0.1   sv.localhost
  127.0.0.1   scan.localhost
  ```

