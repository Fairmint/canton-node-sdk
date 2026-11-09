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

## Reading the ledger by interface

`getActiveContracts`, `subscribeToUpdates`, `getUpdateById` and `getUpdateByOffset` accept
`interfaceIds` filters, with `includeInterfaceView` and `includeCreatedEventBlob` to return each
contract's interface view and created-event blob. `streamActiveContracts` reads a large active
contract set without collecting it in memory: it yields items as they arrive, applies back-pressure
to the participant, and throws if the connection closes before the snapshot is complete. Its
`activeAtOffset` is the offset to pass to `subscribeToUpdates` as `beginExclusive`. See
[`examples/stream-active-contracts.ts`](https://github.com/Fairmint/canton-node-sdk/blob/main/examples/stream-active-contracts.ts).

## Reading as every party

A party list is a filter: a party it misses, such as one allocated later, is read as if it did not
exist. Every read that builds an event format also takes `anyParty: true` instead of a party list
(`subscribeToUpdates`, `getUpdateById`, `getActiveContracts`, `streamActiveContracts`,
`getEventsByContractId`, and the `buildEventFormat` / `buildTransactionFormat` / `buildUpdateFormat`
builders for `getUpdateByOffset` and `getUpdatesPage`, whose any-party parameters are
`AnyPartyEventFormatBuilderParams` and its transaction and update variants). It sends
`filtersForAnyParty`, which covers every party the participant hosts, and needs the user's
`CanReadAsAnyParty` right; `assertCanReadAsAnyParty(client)` checks it and throws a
`MissingUserRightError` naming the user and the rights it holds. The types reject `anyParty`
together with `parties` or `readAs`, and the reads reject the combination at run time. Without
`anyParty`, every read behaves as before.

For an archive of what the ledger said, `getRawUpdatesPage` and `subscribeToRawUpdates` return each
page, page item or frame as the exact text the participant sent and its `JSON.parse` value, with no
schema normalization, failing instead if parsing would change a number (for example an int64 that
JavaScript cannot hold exactly) or drop a repeated key. Store the `text` of each page item or frame;
re-serializing its `json` would reorder integer-like keys. The stream delivers every kind
(transactions, reassignments, topology transactions and offset checkpoints) one at a time and in
order, applies back-pressure, ends with reason `token-refresh` before the access token expires, and
exposes `lastOffset` to resume from. `subscribeToRawCompletions` reads one user's completions the
same way; it requires an explicit `userId` and a non-empty `parties` list, as the Ledger API does.
See
[`examples/read-any-party.ts`](https://github.com/Fairmint/canton-node-sdk/blob/main/examples/read-any-party.ts).

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
[`@fairmint/canton-dev-tools@0.1.13`](https://www.npmjs.com/package/@fairmint/canton-dev-tools) (see
its [COMPATIBILITY.md](https://github.com/Fairmint/canton-dev-tools/blob/main/COMPATIBILITY.md)).
This SDK does not publish a LocalNet CLI or `scripts/localnet-cloud.sh`.

```bash
npm install   # installs @fairmint/canton-dev-tools as an exact-pinned devDependency
npm run localnet:start
npm run localnet:readiness   # alias: localnet:smoke
npm run localnet:teardown    # alias: localnet:stop

# Or call the Dev Tools CLI directly:
npx @fairmint/canton-dev-tools start
npx @fairmint/canton-dev-tools readiness
npx @fairmint/canton-dev-tools teardown
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
