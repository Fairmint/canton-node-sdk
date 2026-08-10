# canton-node-sdk

Low-level TypeScript SDK for Canton Network nodes (Ledger JSON API, Validator API, Scan API).

## Developer documentation

The public [GitHub wiki](https://github.com/Fairmint/canton-node-sdk/wiki) is the canonical guide for
configuration, API boundaries, external signing, LocalNet, examples, and contribution. The public
[`src/index.ts`](https://github.com/Fairmint/canton-node-sdk/blob/main/src/index.ts) defines the
supported package surface; use the installed declarations and public
[`examples/`](https://github.com/Fairmint/canton-node-sdk/tree/main/examples) and
[`test/`](https://github.com/Fairmint/canton-node-sdk/tree/main/test) for exact methods, request
shapes, and error behavior.

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

### LocalNet (ENG-1635 soft migration)

**Pin owner:** [`@fairmint/canton-dev-tools`](https://github.com/Fairmint/canton-dev-tools) (see its
`COMPATIBILITY.md`). This SDK still ships `bin/canton-localnet` / `scripts/localnet-cloud.sh` as a
temporary fallback. The SDK binary soft-delegates to Dev Tools when that optional dependency is
installed.

```bash
# Preferred once Dev Tools is available (optionalDependency / optional peer):
npx @fairmint/canton-dev-tools start
npm run localnet:dev-tools -- readiness

# Existing SDK scripts still work (delegate when possible, else legacy scripts):
npm run localnet:verify
```

Until `@fairmint/canton-dev-tools` is published to npm, this repo pins the optional dependency to the
ENG-1635 git SHA. After publish, swap that pin to a semver range. Do not delete
`scripts/localnet-cloud.sh` until the hard-cutover follow-up.
