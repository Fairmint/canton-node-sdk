# Canton Node SDK

[![Publish to GitHub Packages](https://github.com/Fairmint/canton-node-sdk/actions/workflows/publish.yml/badge.svg)](https://github.com/Fairmint/canton-node-sdk/actions/workflows/publish.yml)

A TypeScript SDK for interacting with Canton blockchain nodes.

## For End Users

### Installation

This package is published to GitHub Packages as a private package. To use it in your project:

#### Local Development

1. [Create a GitHub Personal Access Token](https://github.com/settings/tokens/new) with
   `read:packages` scope
2. Configure npm to use GitHub Packages for the `@fairmint` scope by adding to your `~/.npmrc`:

   ```ini
   @fairmint:registry=https://npm.pkg.github.com
   //npm.pkg.github.com/:_authToken=YOUR_GITHUB_TOKEN
   ```

3. Install the package:

   ```bash
   npm install @fairmint/canton-node-sdk
   ```

#### CI/CD Setup

For automated builds and deployments, you'll need to configure authentication:

1. [Create a GitHub Personal Access Token](https://github.com/settings/tokens/new) with
   `read:packages` scope
2. Add the token as a secret in your CI environment (e.g., `GITHUB_TOKEN`)
3. Configure npm in your CI pipeline:

   ```bash
   echo "@fairmint:registry=https://npm.pkg.github.com" >> .npmrc
   echo "//npm.pkg.github.com/:_authToken=$GITHUB_TOKEN" >> .npmrc
   npm install
   ```

### Usage

```typescript
import { CantonNodeSDK } from '@fairmint/canton-node-sdk';

// Initialize the SDK
const sdk = new CantonNodeSDK({
  // configuration options
});

// Use the SDK methods
// Example: const result = await sdk.someMethod();
```

## For Contributors

See [CONTRIBUTING.md](./CONTRIBUTING.md) for information about setting up the development
environment.

### Publishing

This package is automatically published via CI/CD when changes are pushed to the main branch. The
publishing workflow:

1. Runs on every push to the `main` branch
2. Automatically increments the patch version
3. Publishes to GitHub Packages
4. Creates a git tag for the release

**No manual publishing is required or recommended.**

### CI Configuration

The publishing workflow requires the following environment setup:

1. **GitHub Token**: The workflow uses `GITHUB_TOKEN` which is automatically provided by GitHub
   Actions
2. **Repository Permissions**: The workflow requires:
   - `contents: read` - to checkout code
   - `packages: write` - to publish to GitHub Packages

These permissions are configured in the workflow file and should not need manual setup.
