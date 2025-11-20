# CI Setup for CN-Quickstart Testing

This document describes the CI/CD setup for testing the Canton Node SDK against cn-quickstart.

## Overview

We've added automated testing that:

1. ✅ Downloads and sets up cn-quickstart
2. ✅ Starts the full cn-quickstart environment with OAuth2
3. ✅ Runs comprehensive smoke tests validating SDK connectivity
4. ✅ Tests both Validator API and Ledger JSON API
5. ✅ Validates the SDK's built-in localnet defaults work

## Test Coverage

The smoke test validates:

- **OAuth2 Authentication**: Connects to Keycloak, obtains JWT tokens
- **Validator API**: `getUserStatus()`, `getDsoPartyId()`
- **Ledger JSON API**: `getVersion()`, `getLedgerEnd()`
- **SDK Defaults**: Confirms `{ network: 'localnet' }` auto-configures everything

## CI Platforms

### CircleCI (Primary)

**File:** `.circleci/config.yml`

**Job:** `test-cn-quickstart`

**Workflow:** Runs on every commit and nightly at 2 AM UTC

**Steps:**

1. Uses `ubuntu-machine` executor (for Docker support)
2. Installs Node.js 20 via nvm
3. Installs npm dependencies
4. Runs `npm run localnet:quickstart` (downloads cn-quickstart)
5. Starts services with `make start`
6. Waits for Keycloak and Validator API to be ready
7. Runs `npm run test:smoke`
8. Shows logs on failure
9. Cleans up services

**View Results:** https://app.circleci.com/pipelines/github/YOUR_ORG/canton-node-sdk

### GitHub Actions (Alternative)

**File:** `.github/workflows/test-cn-quickstart.yml`

**Workflow Name:** Test CN-Quickstart Integration

**Triggers:**

- Push to `main`/`master`
- Pull requests
- Nightly at 2 AM UTC
- Manual trigger via workflow_dispatch

**Steps:** Same flow as CircleCI using GitHub Actions format

**View Results:** https://github.com/YOUR_ORG/canton-node-sdk/actions

## Running Tests Locally

### Quick Test

```bash
# Prerequisites: cn-quickstart must be running
cd cn-quickstart/quickstart && make start

# Run smoke test (from SDK root)
npm run test:smoke
```

Expected output:

```
🧪 Running CN-Quickstart LocalNet Smoke Tests

✅ OAuth2 Authentication (70ms)
✅ Validator API - getUserStatus() (22ms)
✅ Validator API - getDsoPartyId() (10ms)
✅ Ledger JSON API - getVersion() (27ms)
✅ Ledger JSON API - getLedgerEnd() (12ms)

============================================================
Test Results Summary
============================================================
Total: 5 | Passed: 5 | Failed: 0

✅ All tests passed!
```

### Full Local CI Simulation

**CircleCI:**

```bash
# Install CircleCI CLI
brew install circleci

# Validate configuration
circleci config validate

# Run job locally (requires Docker, may have limitations)
circleci local execute --job test-cn-quickstart
```

**GitHub Actions:**

```bash
# Install act
brew install act

# Run workflow locally
act -j test-cn-quickstart
```

**Note:** Local CI runners have limitations with Docker-in-Docker. Best approach is to push to a
test branch and let actual CI run.

## Validating Configuration

### Check CircleCI Config Syntax

```bash
circleci config validate
```

### Check GitHub Actions Workflow

```bash
# GitHub validates on push, or use:
# https://rhysd.github.io/actionlint/
brew install actionlint
actionlint .github/workflows/test-cn-quickstart.yml
```

## Adding to Your CI

### For CircleCI Users

The config is already integrated! It will run automatically on:

- ✅ Every commit (as part of `build-test` workflow)
- ✅ Pull requests
- ✅ Nightly (as part of `nightly-regression` workflow)

To disable cn-quickstart tests on every commit (only run nightly):

```yaml
# In .circleci/config.yml, remove from build-test workflow:
- test-cn-quickstart:
    requires:
      - lint
      - test
```

### For GitHub Actions Users

The workflow file is ready to use! Enable it by:

1. Commit `.github/workflows/test-cn-quickstart.yml`
2. Push to your repository
3. GitHub Actions will automatically detect and run it

## Troubleshooting CI

### Tests Time Out

**Symptoms:** CI job exceeds time limits

**Solutions:**

- Increase `no_output_timeout` in CircleCI
- Increase `timeout-minutes` in GitHub Actions
- Current timeouts: 20min setup, 15min start, 60min total

### Services Not Ready

**Symptoms:** Tests fail with "Connection Refused"

**Solutions:**

- Increase wait time in "Wait for Services" step
- Check Docker container status in logs
- Verify ports are not already in use

### Out of Memory

**Symptoms:** Docker containers crash, services won't start

**Solutions:**

- Use `large` resource class in CircleCI (already configured)
- Ensure GitHub runner has enough memory
- Consider using self-hosted runners for resource-intensive jobs

### Docker Pull Rate Limits

**Symptoms:** "toomanyrequests: You have reached your pull rate limit"

**Solutions:**

- Add Docker Hub credentials to CI environment variables
- Use authenticated Docker pulls
- Consider caching Docker images

## Monitoring and Alerts

### CircleCI

- **Dashboard:** https://app.circleci.com/pipelines/github/YOUR_ORG/canton-node-sdk
- **Email Notifications:** Configure in CircleCI project settings
- **Slack Integration:** Add CircleCI Slack app

### GitHub Actions

- **Dashboard:** Repository → Actions tab
- **Email Notifications:** Automatic for workflow failures
- **Slack Integration:** Use slack-notify action

## Performance Metrics

Typical execution times:

| Step                 | Duration      |
| -------------------- | ------------- |
| Setup Node.js        | ~30s          |
| Install Dependencies | ~2min         |
| Setup CN-Quickstart  | ~10-15min     |
| Start Services       | ~5-10min      |
| Wait for Health      | ~2-3min       |
| Run Smoke Tests      | ~5s           |
| **Total**            | **~20-30min** |

The smoke tests themselves are fast (~200ms), but cn-quickstart setup and startup take time.

## Cost Optimization

### Reduce CI Minutes

1. **Cache npm packages:** Already configured ✅
2. **Run only on main branch:** Update workflow filters
3. **Skip on documentation changes:** Add path filters
4. **Use matrix builds:** If testing multiple versions

### Example: Skip for Docs Changes

```yaml
# In .github/workflows/test-cn-quickstart.yml
on:
  push:
    branches: [main, master]
    paths-ignore:
      - '**.md'
      - 'docs/**'
```

## Maintenance

### Updating CN-Quickstart Version

The setup uses the latest cn-quickstart from the repository. To pin to a specific version:

1. Update the quickstart submodule to a specific tag
2. Or modify `npm run localnet:quickstart` to clone a specific version

### Updating Test Cases

Add new tests to `test/integration/quickstart/smoke-test.ts`:

```typescript
await runTest('New Test Name', async () => {
  const result = await client.newMethod();
  if (!result) {
    throw new Error('Expected result');
  }
});
```

## Next Steps

1. **Monitor First Runs:** Watch the CI jobs on first merge to ensure they pass
2. **Adjust Timeouts:** If jobs timeout, increase accordingly
3. **Add More Tests:** Expand smoke test coverage as needed
4. **Set Up Alerts:** Configure notifications for failures
5. **Document Failures:** Create runbook for common CI issues

## Resources

- **CN-Quickstart Docs:** https://github.com/digital-asset/cn-quickstart
- **CircleCI Docs:** https://circleci.com/docs/
- **GitHub Actions Docs:** https://docs.github.com/en/actions
- **Test README:** `test/integration/quickstart/README.md`
- **Smoke Test:** `test/integration/quickstart/smoke-test.ts`

## Support

For CI issues:

1. Check logs in CI dashboard
2. Review `test/integration/quickstart/README.md`
3. Run tests locally first
4. Compare with successful CI runs
