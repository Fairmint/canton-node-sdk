# Canton Node SDK

A TypeScript SDK for interacting with Canton blockchain nodes.

## Features

- **Type-safe API client** with full TypeScript support
- **OAuth2 authentication** with automatic token management
- **Multi-provider support** across devnet/testnet/mainnet
- **Production-ready** error handling, logging, and retry logic
- **Environment-based configuration** with automatic .env loading

## For End Users

### Installation

This package is published to GitHub Packages as a private package. To use it in your project:

#### Local Development

1. [Create a GitHub Personal Access Token](https://github.com/settings/tokens/new) with
   `read:packages` scope
2. Configure npm to use GitHub Packages for the `@fairmint` scope by adding to your `~/.npmrc`:

   ```bash
   echo "@fairmint:registry=https://npm.pkg.github.com" >> ~/.npmrc
   echo "//npm.pkg.github.com/:_authToken=<YOUR_GITHUB_TOKEN>" >> ~/.npmrc
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
   echo "@fairmint:registry=https://npm.pkg.github.com" >> ~/.npmrc
   echo "//npm.pkg.github.com/:_authToken=$GITHUB_TOKEN" >> ~/.npmrc
   npm install
   ```

## For Contributors

See [CONTRIBUTING.md](./CONTRIBUTING.md) for information about setting up the development
environment.
