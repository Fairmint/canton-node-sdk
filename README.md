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

## Token actions through a CIP-0103 wallet

`Wallets` runs token standard (CIP-56) holder actions on Digital Asset Utility Registry instruments
through any CIP-0103 (Canton dApp API) wallet provider:

- read the wallet's state in one snapshot (`loadState`: holdings, mint offers, transfer offers and
  burn requests), or each list on its own;
- accept a mint offer (`acceptMintOffer`);
- preview and send a transfer, and accept, reject or withdraw a transfer offer
  (`acceptTransferOffer`, `rejectTransferOffer`, `withdrawTransferOffer`);
- propose a burn (`requestBurn`: a burn request the registrar accepts or rejects);
- create a transfer preapproval (experimental);
- prove that the user controls the wallet's party by signing a message (`proveWalletOwnership`,
  verified on your server with `verifyWalletOwnership`).

It reads choice contexts from DA's public Utilities API with an injectable `fetch`, and talks to the
wallet only through CIP-0103 (`getPrimaryAccount`, `ledgerApi`, `prepareExecuteAndWait`,
`signMessage`), so no wallet SDK is involved.

It is browser-safe: import `@fairmint/canton-node-sdk/build/src/wallets/index.js`, which loads none
of the SDK's Node dependencies. The package root also exports it as the `Wallets` namespace.

```ts
import {
  createDaUtilitiesClient,
  createTokenWallet,
  type Cip103Provider,
} from '@fairmint/canton-node-sdk/build/src/wallets/index.js';

async function send(provider: Cip103Provider, receiver: string): Promise<void> {
  const tokens = createTokenWallet({
    provider, // any connected CIP-0103 provider
    registry: createDaUtilitiesClient({ network: 'devnet' }),
  });
  const instrumentId = { admin: 'registrar::1220...', id: 'XMPL' };
  const kind = await tokens.previewTransfer({ receiver, instrumentId, amount: '10' });
  await tokens.transfer({ receiver, instrumentId, amount: '10', expectedKind: kind });
}
```

- Load a page with one `loadState()` call: one `/v2/state/ledger-end` call and one paged
  `/v2/state/active-contracts-page` stream whose cumulative filter carries every template and
  interface. Concurrent `loadState` and `list*` calls on one token wallet share the snapshot in
  flight (unless a write settled since it started). Writes do their own fresh reads.
- Wallets rate-limit `ledgerApi` (Loop answers CIP-0103 -32005 for an HTTP 429). Reads answered
  -32005 are retried after 0.5, 1, 2 and 4 s (jittered; `readRetry` changes it); then they fail with
  a `WalletReadError` whose `rateLimited` is true, so a UI can offer a retry. Only a wallet that
  does not offer the paged endpoint or refuses its request (4200, -32601, -32004, -32602) gets one
  unpaged `/v2/state/active-contracts` read instead, and if that fails too the error names both
  failures. A rate limit or a timeout never falls back.
- Writes never retry. A `WalletSubmitError` has `outcome` `rejected-by-user` (CIP-0103 4001),
  `failed` (-32003, or a request the wallet refused before taking it on) or `unknown` (session
  errors 4100/4900/4901 during a submit, timeouts, anything else): check the wallet before
  resubmitting.
- One write at a time per token wallet: a write started while another is in progress is refused with
  `busy` before any read, so two writes never pick the same holdings.
- Holdings count only when their registrar signed them, and offers and requests only when a trusted
  registry provider signed them. By default a registrar must be its own provider; for a registrar
  served by another provider pass `trustedProviders` to `createDaUtilitiesClient`. Contracts of any
  other provider are never listed or acted on.
- Amounts are exact decimals (at most 10 places, within Daml `Numeric 10`); inputs are picked
  deterministically. `requirePreapproval: true` sends only when the receiver pre-approved the
  transfer, and `expectedKind` refuses a transfer whose kind changed since the preview.

### Proving wallet ownership

A connected wallet only tells the dApp a party id, which anyone can claim. To know the user controls
the party, the server issues a challenge, the wallet signs it, and the server verifies the
signature. A check in the browser proves nothing.

1. The server issues `{ domain, nonce, issuedAt, expiresAt, network? }`: its own host, a random
   single-use nonce it stores, and a short validity window (at most 10 minutes by default).
2. The browser calls `proveWalletOwnership(provider, { challenge })`. The wallet signs, as its
   primary account, a canonical text message: a fixed title, a statement that it is not a
   transaction and authorizes nothing, then the domain, party, network, nonce and times. Plain text
   with a fixed prefix can never be a Canton transaction or topology hash (34 binary bytes), which
   the same key signs.
3. The server calls
   `verifyWalletOwnership(proof, { expectedNonce, expectedDomain, expectedNetwork })` (Node only,
   from the package root, not the browser entry), then marks the nonce used.

`verified: true` means: the message is exactly canonical, for this domain, nonce and network, and
within its window; the Ed25519 signature over its UTF-8 bytes verifies; and the key's Canton
fingerprint (`1220` + SHA-256 of purpose 12 and the raw key) is the party's namespace, which is how
an external party's id is derived from its key. Otherwise the result gives a `reason`. A party not
namespaced by its signing key (a participant-hosted party, or an external party whose key was
rotated or delegated) fails with `key-not-bound-to-party`: proving it would need a ledger topology
lookup (its `PartyToKeyMapping` and namespace delegations), which the verifier does not do.

CIP-0103 does not fix the signature format. The verifier accepts what the known wallets send and
refuses anything else:

- Loop (from its wallet code, not its documentation): Ed25519 over the UTF-8 message bytes, a
  lowercase hex signature, and a lowercase hex raw 32-byte public key. Not yet confirmed against a
  live DevNet signature: that Loop's backend relays the hex signature unchanged and that
  `getPrimaryAccount` returns the key in the same hex form.
- The CIP-0103 reference wallet (splice-wallet-kernel): the same signature scheme, with base64
  signature and key.
- Keys: 64 hex characters, base64 or base64url of the raw key or of its DER SubjectPublicKeyInfo, 88
  hex characters of DER, or PEM. Signatures: 128 hex characters, or base64/base64url of 64 bytes.
  ECDSA keys are refused.

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
