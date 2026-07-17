# canton-node-sdk

Low-level TypeScript SDK for Canton Network nodes (Ledger JSON API, Validator API, Scan API).

## Developer documentation

The public [GitHub wiki](https://github.com/Fairmint/canton-node-sdk/wiki) is the canonical guide for
configuration, API boundaries, external signing, LocalNet, examples, and contribution. The
supported package surface is [`src/index.ts`](src/index.ts); use the installed declarations,
[`examples/`](examples/), and tests for exact methods, request shapes, and error behavior.

## Install

```bash
npm install @fairmint/canton-node-sdk
```

```ts
import { Canton } from "@fairmint/canton-node-sdk";

async function main(): Promise<void> {
  const canton = new Canton({ network: "localnet" });
  const version = await canton.ledger.getVersion();
  console.log(version);
}

void main();
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
