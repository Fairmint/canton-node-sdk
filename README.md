# canton-node-sdk

Low-level TypeScript SDK for Canton Ledger JSON, Validator, and Scan APIs.

## Developer documentation

- [Getting started and configuration](docs/getting-started.md)
- [API map and runnable examples](docs/api-and-examples.md)
- [External-party signing](docs/external-signing.md)
- [LocalNet development](docs/localnet.md)

The supported package surface is defined by [`src/index.ts`](src/index.ts). Use the runnable
[`examples/`](examples/) and current source for exact methods, request shapes, and error behavior.

## Install

```bash
npm install @fairmint/canton-node-sdk
```

```ts
import { Canton } from '@fairmint/canton-node-sdk';

const canton = new Canton({ network: 'localnet' });
const version = await canton.ledger.getVersion();
```

## Repository setup and checks

```bash
git submodule update --init --depth 1 libs/splice
git submodule update --init --recursive libs/cn-quickstart
npm install
npm run fix
npm test
npm run build
```

Run `npm run localnet:verify` for the full LocalNet smoke and integration path.
