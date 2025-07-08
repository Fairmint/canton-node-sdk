# Contributing to Canton Node SDK

## Publishing

This package is automatically published via CI/CD when changes are pushed to the main branch. The publishing workflow:

1. Runs on every push to the `main` branch
2. Automatically increments the patch version
3. Publishes to GitHub Packages
4. Creates a git tag for the release

**No manual publishing.**

### CI Configuration

The publishing workflow requires the following environment setup:

1. **GitHub Token**: The workflow uses `GITHUB_TOKEN` which is automatically provided by GitHub Actions
2. **Repository Permissions**: The workflow requires:
   - `contents: read` - to checkout code
   - `packages: write` - to publish to GitHub Packages

These permissions are configured in the workflow file and should not need manual setup.
