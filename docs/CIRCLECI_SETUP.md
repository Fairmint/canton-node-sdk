# CircleCI Setup Guide

This guide explains the CircleCI configuration for the Canton Node SDK, including LocalNet integration and regression testing.

## Table of Contents

- [Overview](#overview)
- [Configuration Structure](#configuration-structure)
- [Jobs](#jobs)
- [Workflows](#workflows)
- [Environment Setup](#environment-setup)
- [LocalNet Integration](#localnet-integration)
- [Troubleshooting](#troubleshooting)

## Overview

The CircleCI pipeline provides:

1. **Automated Testing**: Unit tests, integration tests, and regression tests
2. **Code Quality**: Linting and formatting checks
3. **LocalNet Integration**: Full Splice LocalNet deployment in CI
4. **Scheduled Tests**: Nightly regression test runs
5. **Artifact Storage**: Test results and simulation outputs

## Configuration Structure

The configuration file `.circleci/config.yml` consists of:

```yaml
version: 2.1

executors:        # Environment definitions
commands:         # Reusable command sequences
jobs:            # Individual job definitions
workflows:       # Job orchestration
```

### Executors

#### node-docker
- **Image**: `cimg/node:20.18`
- **Resource**: Large (4 vCPU, 8GB RAM)
- **Use**: Standard Node.js jobs (lint, test)

#### ubuntu-machine
- **Image**: `ubuntu-2404:2024.05.1`
- **Resource**: Large machine with Docker support
- **Use**: LocalNet integration tests (requires Docker-in-Docker)

## Jobs

### 1. test

**Purpose**: Run unit tests

**Executor**: `node-docker`

**Steps**:
1. Checkout code
2. Restore/install dependencies
3. Run Jest tests
4. Type check with TypeScript

**Runtime**: ~2-3 minutes

```yaml
test:
  executor: node-docker
  steps:
    - checkout
    - restore_node_modules
    - run: npm ci
    - save_node_modules
    - run: npm test
    - run: npm run build:core
```

### 2. lint

**Purpose**: Code quality checks

**Executor**: `node-docker`

**Steps**:
1. Checkout code
2. Restore/install dependencies
3. Run ESLint
4. Check code formatting with Prettier

**Runtime**: ~1-2 minutes

```yaml
lint:
  executor: node-docker
  steps:
    - checkout
    - restore_node_modules
    - run: npm ci
    - save_node_modules
    - run: npm run lint
    - run: npm run format
```

### 3. test-localnet

**Purpose**: Integration/regression tests with LocalNet

**Executor**: `ubuntu-machine`

**Steps**:
1. **Setup Environment**:
   - Install Node.js via nvm
   - Install project dependencies

2. **Setup LocalNet**:
   - Download Splice bundle (v0.4.22)
   - Extract to `/tmp/`
   - Verify files

3. **Start LocalNet**:
   - Start Docker Compose services
   - Wait for health checks (max 5 minutes)
   - Verify JSON API endpoints

4. **Run Tests**:
   - Create LocalNet `.env` configuration
   - Build SDK
   - Run all simulations

5. **Cleanup**:
   - Save test artifacts
   - Show logs on failure
   - Stop containers

**Runtime**: ~10-15 minutes

**Artifacts**:
- Simulation results: `simulations/results/`

## Workflows

### build-test

**Trigger**: Every commit/push

**Jobs**:
```
lint ─┐
      ├─→ test-localnet
test ─┘
```

**Purpose**: Validate all code changes

**Behavior**:
- Runs on all branches
- `test-localnet` only runs if `lint` and `test` succeed
- Blocks PR merge if any job fails

### nightly-regression

**Trigger**: Scheduled (cron)

**Schedule**: `0 2 * * *` (2 AM UTC daily)

**Jobs**:
- `test-localnet`

**Branches**:
- `main`
- `master`

**Purpose**: Catch regressions overnight

**Behavior**:
- Runs even if no new commits
- Sends notification on failure
- Does not block development

## Environment Setup

### Node.js Installation (test-localnet)

The `ubuntu-machine` executor doesn't have Node.js pre-installed, so the job installs it:

```bash
# Install nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Install Node.js 20
nvm install 20
nvm use 20
```

This is added to `$BASH_ENV` for persistence across steps.

### Environment Variables

#### Automatic (from commands)

```bash
LOCALNET_DIR=/tmp/splice-node/docker-compose/localnet
IMAGE_TAG=0.4.22
NVM_DIR=$HOME/.nvm
```

#### Created in .env (for SDK)

```bash
CANTON_CURRENT_NETWORK=localnet
CANTON_CURRENT_PROVIDER=app-provider
CANTON_LOCALNET_APP_PROVIDER_LEDGER_JSON_API_URI=http://localhost:39750
CANTON_LOCALNET_APP_PROVIDER_VALIDATOR_API_URI=http://localhost:39030
# ... more configuration
```

## LocalNet Integration

### Setup Process

#### 1. Download Bundle

```bash
curl -L "https://github.com/digital-asset/splice/releases/download/v0.4.22/0.4.22_splice-node.tar.gz" \
  -o splice-node.tar.gz
```

**Size**: ~500MB
**Time**: 1-2 minutes

#### 2. Extract Bundle

```bash
tar xzvf splice-node.tar.gz
```

**Time**: 30-60 seconds

#### 3. Start Services

```bash
docker compose \
  --env-file $LOCALNET_DIR/compose.env \
  --env-file $LOCALNET_DIR/env/common.env \
  -f $LOCALNET_DIR/compose.yaml \
  -f $LOCALNET_DIR/resource-constraints.yaml \
  --profile sv \
  --profile app-provider \
  --profile app-user \
  up -d
```

**Services Started**:
- PostgreSQL database
- 3 validator nodes (sv, app-provider, app-user)
- Web UIs (wallet, sv, scan)

**Time**: 2-3 minutes

#### 4. Health Checks

The job waits for JSON API endpoints to respond:

```bash
# Check app-provider JSON API (port 39750)
curl -f -s http://localhost:39750/livez
```

**Checks**:
- App Provider JSON API (39750)
- Retries up to 60 times (5 minutes)
- Exits with error if timeout

### Port Configuration

LocalNet uses a predictable port pattern: `{prefix}{base_port}`

| Validator | Prefix | JSON API | Validator API | Admin API |
|-----------|--------|----------|---------------|-----------|
| app-provider | 3 | 39750 | 39030 | 39020 |
| app-user | 2 | 29750 | 29030 | 29020 |
| sv | 4 | 49750 | 49030 | 49020 |

### Resource Usage

**Docker Resources**:
- CPU: ~2-3 cores
- Memory: ~4-6 GB
- Disk: ~2 GB

**CircleCI Resources**:
- Executor: Large machine (4 vCPU, 8GB RAM)
- Network: Egress for Splice bundle download

## Commands Reference

### restore_node_modules

**Purpose**: Restore npm dependencies from cache

**Cache Key**: Based on `package-lock.json` hash

**Fallback**: Uses previous cache if exact match not found

```yaml
restore_cache:
  keys:
    - v1-dependencies-{{ checksum "package-lock.json" }}
    - v1-dependencies-
```

### save_node_modules

**Purpose**: Save npm dependencies to cache

**Cache Key**: Based on `package-lock.json` hash

**Paths**: `node_modules/`

```yaml
save_cache:
  key: v1-dependencies-{{ checksum "package-lock.json" }}
  paths:
    - node_modules
```

### setup_localnet

**Purpose**: Download and verify Splice LocalNet bundle

**Parameters**:
- `version` (default: "0.4.22")

**Environment Variables Set**:
- `LOCALNET_DIR`
- `IMAGE_TAG`

**Verification**:
- Directory exists
- `compose.yaml` exists

### start_localnet

**Purpose**: Start LocalNet Docker Compose services

**Dependencies**:
- `setup_localnet` must run first
- `LOCALNET_DIR` must be set

**Wait Time**: 30 seconds initial + health checks

### stop_localnet

**Purpose**: Stop and remove LocalNet containers

**Behavior**:
- Runs even if tests fail (`when: always`)
- Removes volumes (`-v` flag)
- Gracefully handles missing environment

### show_localnet_logs

**Purpose**: Display LocalNet logs on failure

**Behavior**:
- Only runs on failure (`when: on_fail`)
- Shows last 100 lines of each service
- Helps debug test failures

## Troubleshooting

### Job Fails at "Download Splice LocalNet Bundle"

**Symptoms**:
- Download times out
- 404 error
- Network error

**Solutions**:
1. Check Splice release exists: https://github.com/digital-asset/splice/releases/tag/v0.4.22
2. Update version in `.circleci/config.yml` if needed
3. Check CircleCI network connectivity

### Job Fails at "Wait for LocalNet to be Ready"

**Symptoms**:
- Health checks timeout after 5 minutes
- Services not responding

**Solutions**:
1. Check Docker service logs (shown automatically on failure)
2. Increase wait time in config
3. Check resource constraints in `resource-constraints.yaml`
4. Verify service dependencies are met

### Job Fails at "Run Regression Tests"

**Symptoms**:
- Tests connect but fail
- API errors
- Missing configuration

**Solutions**:
1. Verify `.env` configuration in job
2. Check Party IDs are correct
3. Ensure LocalNet is fully initialized
4. Review simulation error messages

### Out of Memory Errors

**Symptoms**:
- Docker containers killed
- "Cannot allocate memory" errors

**Solutions**:
1. Use larger executor resource class
2. Reduce number of profiles started (remove `--profile app-user`)
3. Adjust resource constraints in LocalNet config

### Caching Issues

**Symptoms**:
- Dependencies reinstall every time
- Old dependencies used

**Solutions**:
1. Update cache version prefix (v1 → v2)
2. Clear CircleCI cache in project settings
3. Verify `package-lock.json` is committed

## Optimization Tips

### Speed Up Builds

1. **Use Caching**: Already implemented for `node_modules`
2. **Parallel Jobs**: `lint` and `test` run in parallel
3. **Docker Layer Caching**: Enable in CircleCI project settings
4. **Reduce Profiles**: Start only needed LocalNet services

### Reduce Costs

1. **Limit Nightly Runs**: Adjust cron schedule
2. **Use Smaller Executors**: For `lint` and `test` jobs (already optimized)
3. **Branch Filters**: Limit `test-localnet` to important branches
4. **Pull Request Only**: Remove from regular commits

### Improve Reliability

1. **Increase Timeouts**: For flaky services
2. **Retry Logic**: Add retry to critical steps
3. **Better Health Checks**: More comprehensive endpoint checks
4. **Gradual Startup**: Wait between service groups

## Monitoring

### Key Metrics to Watch

1. **Job Duration**:
   - `test`: Should be < 3 minutes
   - `lint`: Should be < 2 minutes
   - `test-localnet`: Should be < 15 minutes

2. **Failure Rate**:
   - Target: < 5% for environmental issues
   - Alert if consistently failing

3. **Resource Usage**:
   - Memory: Should stay under 6GB
   - CPU: Should not throttle

### CircleCI Dashboard

Monitor at: `https://app.circleci.com/pipelines/github/YOUR_ORG/canton-node-sdk`

**Useful Views**:
- **Insights**: Job duration trends, failure rates
- **Workflows**: Overall pipeline health
- **Artifacts**: Test results, simulation outputs

## Additional Resources

- [CircleCI Documentation](https://circleci.com/docs/)
- [LocalNet Testing Guide](./LOCALNET_TESTING.md)
- [Splice Documentation](https://docs.dev.sync.global/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)

## Support

For issues with:
- **CI Configuration**: Open issue in canton-node-sdk repo
- **LocalNet**: Check Splice documentation
- **CircleCI Platform**: Contact CircleCI support

