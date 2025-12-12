# Contributing to Canton Node SDK

## Development workflow

- **Read first**: `README.md` (project + LocalNet testing) and `CLAUDE.md` (repo-specific engineering + AI workflow notes).
- **Install**: `npm install`
- **Checks (run before opening a PR)**:
  - `npm run lint`
  - `npm run build`
  - `npm test`
  - `npx tsc --noEmit`

## Minimal documentation requirements

Keep docs sparse and non-redundant; prefer linking to existing docs over duplicating them.

- **When changing public behavior or public API**: update the relevant docs under `docs/` and/or add/update an example under `examples/`.
- **When adding a new client/operation**: ensure it is discoverable from the main docs entry points (start with a link; expand later).
- **No “drive-by” docs**: avoid large speculative documentation; add only what is necessary for the change.

## Testing policy (do not skip tests)

Tests must not be skipped or disabled to get a PR “green”.

- **Never**:
  - comment out tests,
  - add ignore patterns to hide failing tests,
  - change CI/test config to avoid running tests,
  - merge with failing tests.
- **If tests are failing**: fix the bug, fix the test, or explicitly document and address required prerequisites (e.g. LocalNet) rather than skipping.

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
