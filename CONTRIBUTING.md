# Contributing to Canton Node SDK

## Development workflow

- **Read**: `README.md` (human overview) and `llms.txt` (AI context + links).
- **Install**: `npm install`
- **Before opening a PR**:
  - `yarn lint && yarn build && yarn test`
  - `RUN_INTEGRATION_TESTS=true yarn test` (requires LocalNet prerequisites)
  - `npx tsc --noEmit`

## Documentation (minimal requirements)

Keep docs sparse and avoid redundancy by following this hierarchy:

1. `llms.txt` (AI reads first; links to deeper docs)
2. `README.md` (humans read first)
3. `docs/` (deep technical / user guides)

Update documentation when you:
- change public behavior / public API → update `docs/` and/or `examples/`
- add new clients/operations → ensure discoverability via links (start small; expand later)
- change setup/commands → update `README.md` and `llms.txt`

## Testing policy (do not skip tests)

**Tests must not be skipped** to get a PR green.

- Don’t comment out tests or add ignore patterns to hide failures.
- Don’t change test config/CI to avoid running tests.
- If a test needs prerequisites (e.g. LocalNet), document the prerequisite and keep the test running (CI should provide prerequisites).

## Publishing

This package is automatically published via CI/CD when changes are pushed to the main branch. The
publishing workflow:

1. Runs on every push to the `main` branch
2. Automatically increments the patch version
3. Publishes to GitHub Packages
4. Creates a git tag for the release

**No manual publishing.**

### CI Configuration

The publishing workflow requires the following environment setup:

1. **GitHub Token**: The workflow uses `GITHUB_TOKEN` which is automatically provided by GitHub
   Actions
2. **Repository Permissions**: The workflow requires:
   - `contents: read` - to checkout code
   - `packages: write` - to publish to GitHub Packages

These permissions are configured in the workflow file and should not need manual setup.
