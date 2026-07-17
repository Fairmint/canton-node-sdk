# Getting started

`@fairmint/canton-node-sdk` is an ESM TypeScript SDK for Canton's Ledger JSON, Validator, and Scan
APIs. It requires Node.js 22 or newer.

## Install and connect

```bash
npm install @fairmint/canton-node-sdk
```

The unified `Canton` client shares one runtime and configuration across all three APIs:

```ts
import { Canton } from '@fairmint/canton-node-sdk';

const canton = new Canton({ network: 'localnet' });
const version = await canton.ledger.getVersion();
const health = await canton.checkHealth();
```

Use `canton.ledger` for Ledger JSON API operations, `canton.validator` for authenticated Validator
operations, and `canton.scan` for public Scan reads. If an application discovers or switches its
acting party at runtime, use `getPartyId()` and `setPartyId()` on the unified client.

## Configuration

For hosted networks, provide `network` and usually `provider`; the SDK resolves conventional
`CANTON_*` variables. A typical client-credentials setup contains:

```text
CANTON_CURRENT_NETWORK=devnet
CANTON_CURRENT_PROVIDER=5n
CANTON_DEVNET_5N_AUTH_URL=https://example.invalid/oauth2/token
CANTON_DEVNET_5N_LEDGER_JSON_API_URI=https://example.invalid/ledger-json-api
CANTON_DEVNET_5N_LEDGER_JSON_API_CLIENT_ID=...
CANTON_DEVNET_5N_LEDGER_JSON_API_CLIENT_SECRET=...
CANTON_DEVNET_5N_VALIDATOR_API_URI=https://example.invalid/validator-api
CANTON_DEVNET_5N_VALIDATOR_API_CLIENT_ID=...
CANTON_DEVNET_5N_VALIDATOR_API_CLIENT_SECRET=...
```

Exact required values depend on the network and provider. Inspect
[`src/core/config/`](../src/core/config/) and the `CantonConfig` type in
[`src/Canton.ts`](../src/Canton.ts) before provisioning configuration. Never commit credentials.

When only one API client is needed, construct `CantonRuntime` and that client directly. The current
pattern is demonstrated in
[`examples/localnet-with-oauth2.ts`](../examples/localnet-with-oauth2.ts).

## Failures and diagnostics

The SDK exposes typed configuration, authentication, API, validation, and network errors. Treat HTTP
failures as rejected requests unless a returned update or completion proves ledger submission.
Enable `debug` or inject a logger only where its output is safe; review the logging and redaction
code under [`src/core/logging/`](../src/core/logging/).

Continue with the [API map](api-and-examples.md), or use [LocalNet](localnet.md) for a local Canton
environment.
