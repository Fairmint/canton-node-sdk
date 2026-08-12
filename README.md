# canton-node-sdk

Low-level TypeScript SDK for Canton Network nodes (Ledger JSON API, Validator API, Scan API).

## Developer documentation

The public [GitHub wiki](https://github.com/Fairmint/canton-node-sdk/wiki) is the canonical guide
for configuration, API boundaries, external signing, LocalNet, examples, and contribution. The
public [`src/index.ts`](https://github.com/Fairmint/canton-node-sdk/blob/main/src/index.ts) defines
the supported package surface; use the installed declarations and public
[`examples/`](https://github.com/Fairmint/canton-node-sdk/tree/main/examples) and
[`test/`](https://github.com/Fairmint/canton-node-sdk/tree/main/test) for exact methods, request
shapes, and error behavior.

## Install

```bash
npm install @fairmint/canton-node-sdk
```

```ts
import { Canton } from '@fairmint/canton-node-sdk';

async function main(): Promise<void> {
  const canton = new Canton({ network: 'localnet' });
  const version = await canton.ledger.getVersion();
  console.log(version);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
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

### LocalNet (owned by `@fairmint/canton-dev-tools`)

LocalNet lifecycle and shared test helpers live in
[`@fairmint/canton-dev-tools@0.1.7`](https://www.npmjs.com/package/@fairmint/canton-dev-tools)
(see its [COMPATIBILITY.md](https://github.com/Fairmint/canton-dev-tools/blob/main/COMPATIBILITY.md)).
This SDK does not publish a LocalNet CLI or `scripts/localnet-cloud.sh`.

```bash
npm install   # installs @fairmint/canton-dev-tools as an exact-pinned devDependency
npm run localnet:start
npm run localnet:smoke
npm run localnet:stop

# Or call the Dev Tools CLI directly:
npx @fairmint/canton-dev-tools start
```

Integration helpers:

```ts
import {
  buildIntegrationTestClientConfig,
  getLocalnetParticipantAdminLedgerClient,
} from '@fairmint/canton-dev-tools/testing';
```

See [docs/package-boundary.md](docs/package-boundary.md) for what the npm package publishes versus
CI-only surfaces (`npm run check:package-artifacts`).
