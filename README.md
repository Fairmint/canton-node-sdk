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

It needs Node.js 22.12 or later. The SDK is CommonJS, and its dependency
[`@fairmint/canton-protocol`](https://www.npmjs.com/package/@fairmint/canton-protocol) is ESM only:
Node loads it through `require()` of an ES module, which Node 22 supports without a flag from 22.12.

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

## Onboarding an external party

`prepareExternalPartyOnboarding`, `createExternalPartyWithSigner`,
`createExternalPartyWithEd25519Signer`, the wallet bridge's `prepareExternalParty` and
`createExternalParty` never sign the participant's word for the topology. They read the local
participant's ID (`GET /v2/parties/participant-id`), check the generated topology with
`verifyPartyOnboardingTopology` from `@fairmint/canton-protocol/topology` (the party, its one key
with the usages `NAMESPACE`, `PROTOCOL` and `PROOF_OF_OWNERSHIP`, every hosting participant with its
permission, and the threshold, which defaults to every confirming participant), and hand the signer
only the multi-hash recomputed from the transactions. A topology that differs is an `OperationError`
(`TRANSACTION_FAILED`) whose `cause` is the `CantonProtocolError`, and nothing is signed. Hosting
participant UIDs are `name::1220…` (no `PAR::` prefix), each listed once; at least one participant
must confirm. `submitExternalPartyOnboarding` refuses a `multiHashHex` that is not the multi-hash of
the submitted `topologyTransactions`. Canton 3.4 or later is required.

## Signing a prepared transaction

Every place the SDK prepares a transaction for an external party to sign
(`executeExternalTransactionWithEd25519Signer`, `prepareExternalPartyCcTokenStandardTransfer`,
`prepareExternalPartyTransferOfferAcceptance`, the wallet bridge's `prepareCcTransfer` and
`prepareProviderTransfer`, and `prepareExternalPartyTransferPreapprovalSetup`) returns, or signs,
only the hash it recomputed from the prepared transaction with `verifyPreparedTransaction` from
`@fairmint/canton-protocol/transaction`. The participant's hash must equal it, under the hashing
scheme the SDK asked for (an answer naming another scheme is refused), and the transaction must act
exactly as the requested parties, under the requested command id, on the requested synchronizer.
Anything else is an `OperationError` (`TRANSACTION_FAILED`) whose `cause` is the
`CantonProtocolError` and whose context names its `code` and `field`; nothing is returned to sign.
The validator prepares the transfer-preapproval setup under a command id and synchronizer of its own
choosing, so for it the hash (scheme V2, which the validator executes under) and the acting party
are checked.

Before anything is executed or submitted, `executeExternalPartySignedTransaction` (and so every
submit helper) and `submitExternalPartyTransferPreapprovalSetup` recompute the hash of the submitted
`preparedTransaction` and refuse a `preparedTransactionHashHex` that differs, or a transaction that
acts as any party but the signer, with a `ValidationError`. The wallet bridge's prepare tokens bind
the recomputed hash, the command id and the synchronizer (CC transfer version 3, which
`submitCcTransfer` now needs `synchronizerId` back for; provider acceptance version 2), not the
transaction bytes: the submit recomputes the hash from the bytes instead. Signing your own
`prepareExternalTransaction` result? Recompute the hash the same way before you sign it.

## Finding every party a key controls

An external party's ID is `hint::fingerprint`, where the fingerprint is Canton's SHA-256 multihash
of the Ed25519 key: `1220` + hex(sha256(int32be(12) || rawKey)). Nothing about it depends on the
signer, so one module serves any wallet. It is browser-safe: import
`@fairmint/canton-node-sdk/external-parties` (it loads `@fairmint/canton-protocol/party` and none of
the SDK's Node dependencies); the package root also exports it as the `ExternalParties` namespace.

```typescript
import { createExternalPartyDirectory } from '@fairmint/canton-node-sdk/external-parties';
import { isCantonProtocolError } from '@fairmint/canton-protocol/party';

// One directory per participant: one scan of its party store answers every key for 30 s.
const directory = createExternalPartyDirectory({ ledgerClient }); // a LedgerJsonApiClient
try {
  const { parties, complete } = await directory.listPartiesForKey({
    publicKeyBase64, // raw or DER Ed25519 key; or pass publicKeyFingerprint
    hints: ['wallet'], // looked up exactly when the scan does not show them
    signal,
  });
  // parties: [{ partyId, partyHint, hostedHere }], sorted by hint
} catch (error) {
  if (isCantonProtocolError(error, 'LIST_FAILED')) {
    // error.cause is the ledger client's error
  }
  throw error;
}
```

The participant API has no namespace filter, so a scan reads `GET /v2/parties` page by page and
keeps the parties ending in `::fingerprint`. Each scan is bounded (`pageSize` 1000, `maxPages` 10,
`timeoutMs` 10 s, a stalled page included) and cached for every key (`cacheMs` 30 s; concurrent
callers share one scan). When a bound stops it first the answer is `complete: false`, and the hints
asked for are still looked up with `GET /v2/parties/{party}` (also when the scan is complete, since
a cached scan can predate a newer party). `noteAllocated(partyId)` lists a party you just allocated
at once; `findParty({ partyId })` is the exact lookup on its own. Errors are canton-protocol's
`CantonProtocolError` with a `code` (`INVALID_INPUT`, `INVALID_RESPONSE`, `ABORTED`, `LIST_FAILED`,
`LOOKUP_FAILED`); a ledger failure is its `cause`.

The identity rules and the list-plus-lookups logic are
[`@fairmint/canton-protocol`](https://www.npmjs.com/package/@fairmint/canton-protocol)'s: import
`fingerprintEd25519PublicKey`, `buildExternalPartyId`, `parsePartyId`, `readPartyNamespace`,
`normalizeEd25519PublicKeyForCanton`, `decodeEd25519PublicKey`, `isCantonHash` and
`discoverExternalParties` (over your own `listParties` / `findParty` callbacks) from
`@fairmint/canton-protocol/party`. A naming policy for new hints is the app's own.

## Token actions through a CIP-0103 wallet

`Wallets` runs Digital Asset Utility Registry holder actions through any CIP-0103 (Canton dApp API)
wallet provider, on one DA network (`devnet` or `mainnet`). It talks to the wallet only through
CIP-0103 and to DA's public Utilities API through `fetch`, so no wallet SDK is involved. It is
browser-safe: import `@fairmint/canton-node-sdk/wallets`, which loads none of the SDK's Node
dependencies. The package root also exports it as the `Wallets` namespace.

- `discoverCip103Wallets()`: the CIP-0103 wallets installed in the browser as extensions, as
  `{ id, name, icon?, load(network) }`; `load` resolves the wallet's provider for a network. It runs
  the Canton dApp SDK's handshake (`canton:requestProvider`, 300 ms of `canton:announceProvider`)
  and talks to each wallet over the dApp SDK's message channel, with no dependency; the page's
  `canton` global is offered only when no wallet announced itself. It corrects for Console Wallet
  1.15 (reached through its injected provider, since its channel never answers errors; base64
  `signMessage`; raw `ledgerApi` bodies; `CANTON_NETWORK_*` network ids), and refuses (4901) an
  account on another network than the one loaded. Remember `id` to reconnect the same wallet on a
  later visit.
- `createCip103Session({ network })`: which wallet is connected, as which party. Call
  `connect(provider)` on a click, `restore(provider)` on page load (it connects silently when the
  wallet says it is still connected, and never shows an error; a wallet the user disconnected stays
  disconnected until the next `connect`), and `disconnect()`.
- `createWalletStore({ session })`: the page's state and actions. `view.state` is one ledger
  snapshot: holdings, `balances` per instrument (with the registry's `metadata`), transfer offers in
  and out, mint offers, burn requests and transfer preapprovals. Transfer offers, mint offers and
  burn requests carry `memo`: the payload's `splice.lfdecentralizedtrust.org/reason` metadata (the
  sender's or issuer's note), or `null` when there is none. `store.act(action)` runs one typed
  action, and `view.notices` lists what to show.
- `createWallet({ provider, partyId, network })`: the same actions for one party, without the store.

The actions are `acceptMintOffer`, `rejectMintOffer`, `acceptTransferOffer`, `rejectTransferOffer`,
`withdrawTransferOffer`, `withdrawExpiredTransferOffers`, `reclaimLockedTokens`, `requestBurn`,
`cancelBurnRequest`, `planTransfer` then `submitTransfer`, `createTransferPreapproval`,
`removeTransferPreapproval` and `proveOwnership`.

```ts
// Offer the installed wallets, then connect the one the user picks.
import { discoverCip103Wallets } from '@fairmint/canton-node-sdk/wallets';

const wallets = await discoverCip103Wallets(); // [{ id, name, icon?, load }]
const provider = await wallets[0].load('devnet');
await session.connect(provider);
```

```ts
// wallet.ts: one session and one store per network, at module level.
import { useEffect, useSyncExternalStore } from 'react';
import {
  createCip103Session,
  createWalletStore,
  type Cip103Provider,
  type DaNetwork,
} from '@fairmint/canton-node-sdk/wallets';

function open(network: DaNetwork) {
  const session = createCip103Session({ network });
  return { session, store: createWalletStore({ session }) };
}
const wallets = { devnet: open('devnet'), mainnet: open('mainnet') };

export function useWallet(network: DaNetwork, provider: Cip103Provider | null) {
  const { session, store } = wallets[network];
  // A wallet session saved on an earlier visit reconnects once the provider is ready.
  useEffect(() => {
    if (provider !== null) void session.restore(provider);
  }, [session, provider]);
  const view = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return { session, store, view };
}
```

```tsx
// page.tsx
import { canAct, walletActionKey } from '@fairmint/canton-node-sdk/wallets';

function WalletPage({ provider }: { provider: Cip103Provider | null }) {
  const { session, store, view } = useWallet('devnet', provider);
  const notices = view.notices.map((notice) => (
    <Alert key={notice.key} level={notice.level} title={notice.title}>
      {notice.message}
      {notice.retry && <button onClick={store.refresh}>Retry</button>}
      {notice.acknowledge && <button onClick={store.acknowledgeUnknownOutcome}>Checked</button>}
    </Alert>
  ));
  if (view.wallet === null) {
    const connect = () => provider && void session.connect(provider);
    return (
      <>
        {notices}
        <button onClick={connect}>Connect</button>
      </>
    );
  }
  return (
    <section key={view.wallet.key}>
      {view.wallet.partyId} <button onClick={session.disconnect}>Disconnect</button>
      {notices}
      {view.state?.mintOffers.map((offer) => {
        const accept = { type: 'acceptMintOffer', mintOfferCid: offer.contractId } as const;
        const running = view.running?.key === walletActionKey(accept);
        return (
          <button
            key={offer.contractId}
            disabled={!canAct(view, accept)}
            onClick={() => void store.act(accept)}
          >
            {running ? 'Accepting…' : `Accept ${offer.amount}`}
          </button>
        );
      })}
    </section>
  );
}

// Send: plan, show plan.description, then submit what was planned.
const plan = await store.act({ type: 'planTransfer', request: { receiver, instrumentId, amount } });
if (plan !== null && confirm(plan.description)) await store.act({ type: 'submitTransfer', plan });
```

- `act` resolves with the action's result, or null when it was refused (busy, disconnected) or
  failed; `view.outcome` then holds the SDK's sentence or the error. Only one wallet call runs at a
  time (`view.busy`), and every write is followed by a reload, also a failed one, since it may have
  committed.
- Writes never retry. A write whose outcome is unknown (the wallet did not confirm it, or lost its
  session during the submission) stays in `view.unknownOutcome`, with its command id and a
  redemption's reference, until `store.acknowledgeUnknownOutcome()`; until then `act` refuses every
  write. A write that settles after its session ended is otherwise recorded by what is known: a
  result as succeeded for its party, a certain failure as failed, a failure before anything was
  submitted not at all.
- A snapshot is one `/v2/state/ledger-end` call and one `POST /v2/state/active-contracts` filtered
  to the five DA templates the wallet reads, plus, with Canton Coin on (the default), the
  `HoldingV1` interface and Canton Coin's transfer instructions. A participant refuses a list longer
  than its `http-list-max-elements-limit` (200 by default); the read then fails with an error that
  says so. A read the wallet rate-limits is retried after 0.5, 1, 2 and 4 s (jittered), then shown
  as a warning with Retry.
- `planTransfer` asks DA's registry how it will run the transfer (`plan.kind`: `direct` through the
  receiver's preapproval, an `offer` the receiver must accept, or `self`).
  `requirePreapproval: true` refuses anything but `direct` before anything is signed, and
  `submitTransfer` refuses with `kind-changed` when the registry now answers another kind. An offer
  keeps the sender's tokens locked until it is accepted, rejected or withdrawn; expiry alone does
  not unlock them (see [Expired offers](#expired-offers)).
- A plan, and every write, belongs to the connected wallet that made it: once the session switched
  account or disconnected, it is refused before anything is read or signed. `submitTransfer` sends
  only a plan the same store planned for its current wallet.
- A holding counts only when it is DA's and both its registrar and owner signed it; an offer or a
  request only when it names DA's operator and a provider trusted for its registrar signed it. A
  registrar trusts only itself unless `registry.trustedProviders` lists others.
- Outside the store, `describeWalletError(error)` turns any error into a sentence that says whether
  anything was submitted, and a `kind` to branch on. Match errors with the guards (`isWalletError`,
  `isWalletSubmitError`, `isWalletReadError`, `isWalletSignError`, …), not `instanceof`: they check
  a brand, so they also match errors of another copy of the module (a page that bundles the SDK
  twice, or two SDK versions).
- A `WalletSubmitError` says whether a retry is safe (`outcome`) and why it failed: `category`
  (`contention`, `not-found`, `precondition`, `duplicate`, `permission`, `timeout`, …, from the
  Canton error the wallet passed on, else from its CIP-0103 code) and, when the wallet passed one
  on, `cantonErrorId` (for example `LOCAL_VERDICT_LOCKED_CONTRACTS`). The category never changes the
  outcome.
- Every call that reads or fetches takes an optional `signal`: `wallet.loadState({ signal })`,
  `wallet.acceptMintOffer(cid, { signal })`, `plan.submit({ signal })`,
  `requestWalletOwnershipVerdict(connection, { ..., signal })`. Once it aborts, the call rejects
  with an `AbortError` (`describeWalletError` kind `cancelled`), its requests get the signal (a
  custom `fetch` receives it in `init.signal`), and nothing is submitted. A write checks the signal
  for the last time right before it hands the transaction to the wallet; from then on it runs to its
  outcome, since CIP-0103 has no cancellation.
- Wallet discovery follows the Canton dApp SDK's announce handshake; a CIP that standardizes
  discovery is still a draft, so `discoverCip103Wallets` will follow it once it settles.

### Connecting a wallet: options, the connector and the write latch

A page that offers several wallets uses `createWalletConnector` instead of wiring the session
itself. It owns the network's session and store, restores the wallet remembered from an earlier
visit, and remembers the user's choice. Like the store it is a framework-free observable
(`subscribe`, `getSnapshot`), and its snapshot carries codes (`status`, `error.code`,
`availability.reason`), never sentences: the page words them.

- Options. A `LoadedWalletOption` loads its CIP-0103 provider on demand:
  `loopWalletOption({ appName, load })` (the app passes Loop's dynamic import; node-sdk does not
  depend on Loop) and `extensionWalletOptions()` (the installed extensions, keyed `extension:<id>`).
  Loop serves one network per page load, so after it is set up its availability on the other network
  is `reload-required`. A `LiveWalletOption` is one the app builds through its own setup UI (Privy's
  session in `@fairmint/canton-privy-sdk` offers one): it offers a provider once set up, and a new
  one whenever its setup changes.
- `connector.connect(key)` is the user's click. A provider loaded beforehand with
  `connector.preload()` is connected synchronously inside the click, which Loop's sign-in window
  needs. A live option without a provider yet answers `preparing` and connects once it offers one; a
  rebuilt provider for the same party shows `reconnecting` with the held connection (`stale`), so
  the page stays mounted. `select(key)` opens a live option's setup UI, and survives a login
  redirect in the same tab. `cancel()` and `disconnect()` end what is in flight.
- Restore. On creation the connector reads `${storageKey}.wallet` (local storage) and restores that
  wallet silently, giving up after `restoreTimeoutMs` (15 s) and forgetting it then or on
  `cancel()`. A retired restore never connects late and never disconnects anything. Storage defaults
  to the page's `localStorage` and `sessionStorage`; either may be missing or throw.
- One write at a time. `createWriteLatch()` is a single-flight latch the store,
  `store.run(label, fn)` (a write that is not a store action) and the app's other writers share. A
  run starts synchronously, so a double click is refused; `bump()` (every wallet change) aborts the
  runs in flight, which then report `dropped`, or `unknown-outcome` once they called
  `markSubmitted()`. The view says why it is busy (`busyReason`: `action`, `run` or `load`, and
  `busyLabel`).
- `readOnly` (or `store.setReadOnly(reason)`) closes the app's write gate: writes are refused, reads
  run, and `actionState` reports `read-only`. `view.shown` is what to render: `state`, or the last
  snapshot of the same `retainKey` while a reload or reconnect runs (`view.stale`).

```ts
const loop = loopWalletOption({
  appName: 'My dApp',
  load: async () => (await import('@fivenorth/loop-sdk')).loop,
});
const connector = createWalletConnector({
  network: 'devnet',
  options: [loop],
  discover: (signal) => extensionWalletOptions({ signal }),
  storageKey: 'my-dapp.wallet',
});
const { status, options, connection, error } = connector.getSnapshot();
await connector.connect('loop'); // { status: 'connected' | 'failed' | 'cancelled' | 'preparing' | 'refused' }
connector.store?.getSnapshot(); // the token wallet view of the connected wallet
```

### One panel per token

`walletTokens(view.state)` gives one entry per token the state names, Canton Coin and DA Registry
tokens in the same shape, so a page renders one token picker and one panel whatever the token. A
token the party is only offered (a mint offer or an incoming transfer before its first holding) is
listed too, with zero balances. Entries are sorted by `symbol`, then instrument id and admin.

```ts
import { walletTokens } from '@fairmint/canton-node-sdk/wallets';

const tokens = view.state === null ? [] : walletTokens(view.state);
// Picker: tokens.map((t) => <option key={t.key} value={t.key}>{t.symbol}</option>)
const token = tokens.find((t) => t.key === selectedKey) ?? tokens[0];
// token.available, token.locked, token.lockedReclaimable, token.canReclaim, token.decimals
// token.offers.{incoming, outgoing, expiredIncoming, expiredOutgoing}, token.mintOffers, token.burnRequests
// token.preapproval: the party's DA preapproval covering it, or null
// token.preapprovalStatus: 'covered' | 'none' | 'unknown' (Canton Coin)
// token.capabilities: { send, burn, preapprove, answerOffers, withdrawOffers, answerMintOffers }
```

- `symbol`, `name` and `decimals` are the registry's metadata (`CC` and `Canton Coin` for Canton
  Coin, also when the party is only offered it), else the instrument id and 10 decimals.
- `offers.expiredIncoming` lists the incoming offers the party can no longer accept (the ledger
  refuses it; rejecting still works): hide Accept on them.
- `capabilities` says what this wallet can do with the token today. For Canton Coin, `send`, `burn`,
  `preapprove` and `answerMintOffers` are false (see [Canton Coin](#canton-coin)); answering
  incoming offers and withdrawing its own are true. For a DA Registry token all are true.
- `preapproval` uses `coveringPreapproval(existing, { instrumentAdmin, instrumentIds })`, the same
  rule `createTransferPreapproval` refuses with `already-exists` by: an issuer-wide preapproval
  covers everything of its admin; one that lists ids covers a request whose ids it all names (never
  an issuer-wide request). Use it to hide or disable a pre-approve button. For Canton Coin
  `preapproval` is null and `preapprovalStatus` is `unknown`: its preapproval is a DSO-signed Splice
  `TransferPreapproval` made through the party's validator, which this wallet does not read, so do
  not say the party has none.

### Expired offers

A transfer offer's `executeBefore` only stops the receiver accepting it: the sender's tokens stay
locked until the sender withdraws it (or the receiver rejects it). `loadState` marks every offer
`expired` when its `executeBefore` has passed by the wallet's clock (the ledger decides by ledger
time, which can differ by a little), and each balance's `lockedInExpiredOffers` is the part of
`locked` that the party's own expired offers keep locked (`lockedReclaimable` in `walletTokens`).

```ts
if (token.canReclaim) {
  // Button: `Reclaim ${token.lockedReclaimable} ${token.symbol}`
  await store.act({ type: 'reclaimLockedTokens', instrumentId: token.instrumentId });
}
```

- `reclaimLockedTokens` unlocks everything of the token that no longer needs to be locked: it
  withdraws the expired outgoing offers (below), then, for Canton Coin, releases each of the party's
  own expired locks that no active offer names (`LockedAmulet_OwnerExpireLockV2`, which Splice lets
  the owner alone run once `expiresAt` passed; a lock left after its offer is gone, for example from
  an earlier run). `InstrumentBalance.lockedInExpiredLocks` is what those locks hold;
  `lockedReclaimable` is both parts, capped at `locked`. `withdrawExpiredTransferOffers` does the
  offers only.
- Both stop at the first failed submission. A failure before anything committed is thrown as usual;
  after that, the call resolves with what committed (`withdrawn`, `released`), the failure
  (`failed: { contractId, error }`, an `unknown` outcome included) and what it did not get to
  (`notAttempted`). The store reports such a result as a failure whose message names what committed,
  and an unknown outcome still locks writes until acknowledged.

- `withdrawExpiredTransferOffers` withdraws every expired outgoing offer of the token, oldest
  deadline first, one `TransferInstruction_Withdraw` submission each, exactly as
  `withdrawTransferOffer` sends it, with the choice context of the offer's own registry (Scan for
  Canton Coin, DA's Utilities API for a DA token). It resolves with the offers withdrawn and is
  refused with `not-found` when there is none.
- Canton Coin (checked against Splice's `AmuletTransferInstruction` and Scan's choice-context
  handler): `TransferInstruction_Withdraw` has no deadline check, and Scan's withdraw context sets
  `expire-lock` to whether the offer's `LockedAmulet` is still active. While it is, the withdrawal
  unlocks it (`LockedAmulet_UnlockV2`, which the DSO's signature on the offer authorizes), so it
  works on an expired offer. When the lock was already released (its owner ran
  `LockedAmulet_OwnerExpireLockV2` after the lock's expiry), the withdrawal only archives the
  expired offer. `lockedInExpiredOffers` counts the `LockedAmulet`'s own amount (which can exceed
  the offered amount), and nothing once it is gone.
- DA tokens: DA's `TransferOffer` implements the same CIP-56 `TransferInstruction_Withdraw`
  (controller: the sender), and the wallet asks DA's registry for its withdraw context. DA's
  contract source is not public, so the reclaimable amount is an estimate: each expired offer's
  amount (capped at the token's locked total), since its create argument names no locked holding.
  Withdrawing still archives the expired offer either way.

### Canton Coin

Canton Coin is on by default: a wallet lists the party's Canton Coin with its other tokens and
Canton Coin transfer offers (for example a faucet's) beside DA's. One option configures it, on the
store or on `createWallet`:

```ts
const store = createWalletStore({
  session,
  // All optional; `{}` (or leaving it out) works on DevNet and MainNet.
  cantonCoin: {
    dsoParty: 'DSO::1220…', // pin the network's DSO party; else the registry's adminId is trusted
    registryUrl: 'https://scan.example', // defaults to SV-1's Scan of the network
    fetch: myFetch, // defaults to globalThis.fetch
  },
});
// cantonCoin: false reads no Canton Coin and never calls Scan.
```

- What is read: `Amulet` and `LockedAmulet` holdings through their `HoldingV1` view, as `holdings`
  with `source: 'amulet'` and a `balances` entry (`locked` apart) under the instrument
  `{ admin: <DSO party>, id: 'Amulet' }` with the registry's metadata (`CANTON_COIN_METADATA` when
  it does not answer); and `AmuletTransferInstruction`s to or from the party, as `transferOffers`
  with `registry: 'amulet'` (DA's carry `registry: 'da'`).
- Trust: Canton Coin counts only when it is the confirmed DSO's and the DSO signed it (with the
  owner for a holding, and every lock holder for a `LockedAmulet`; the sender for an offer). The DSO
  party is resolved once per wallet, for holdings and offers alike: the pinned `dsoParty`, else the
  `adminId` the registry answers at `/registry/metadata/v1/info`. The registry is asked only when
  the party has Canton Coin, and a request is aborted after 5 s. A snapshot looks up the DSO and
  Canton Coin's metadata at once and waits for them together: the very first lookup in full (at most
  5 s, so a cold Scan does not report Canton Coin unavailable on a first load), later ones at most
  1.5 s (a slower answer is cached for the next load). After a failure the registry is not asked
  again for 30 s.
- With a pinned `dsoParty`, the registry's own `adminId` is still checked against it: a registry of
  another DSO has its metadata ignored (`CANTON_COIN_METADATA` is shown) and its choice contexts
  refused with a `RegistryResponseError` naming both parties, before anything is submitted. A
  registry whose `adminId` cannot be read (no `adminId`, an error or a timeout) has its choice
  contexts refused the same way: answering a Canton Coin offer fails closed.
- LocalNet and other custom networks: `network` is `devnet` or `mainnet`, so the default registry is
  DevNet's or MainNet's SV-1 Scan, which names that network's DSO. Pass your own Scan as
  `registryUrl` (or pin `dsoParty`), or the party's Canton Coin is silently left out: Canton Coin of
  any other DSO is never listed and does not set `cantonCoinUnavailable` (anyone can create
  look-alike contracts, so they never raise a warning).
- Fail closed: while the DSO cannot be confirmed, all Canton Coin is left out (never every DSO's)
  and `state.cantonCoinUnavailable` is true; everything else in the snapshot is complete. The store
  then shows a `canton-coin` warning notice with Retry.
- Offers: `acceptTransferOffer`, `rejectTransferOffer` and `withdrawTransferOffer` answer a Canton
  Coin offer like a DA one, with the choice context from the Canton Coin registry. A DA offer never
  waits on Scan, and a Canton Coin offer never waits on DA's Utilities API.

  ```ts
  for (const offer of view.state?.transferOffers.incoming ?? []) {
    if (offer.registry === 'amulet')
      await store.act({ type: 'acceptTransferOffer', transferOfferCid: offer.contractId });
  }
  ```

- Canton Coin is not transferred, burnt or pre-approved through this wallet: `planTransfer`,
  `requestBurn` and `createTransferPreapproval` (for the DSO as `instrumentAdmin`) refuse it with
  `invalid-input`. Unpinned, `createTransferPreapproval` asks Canton Coin's registry for the DSO
  (bounded like a snapshot's lookup); when the registry cannot confirm it, the DA preapproval is
  still created, inert for Canton Coin, rather than making DA writes depend on Scan.
- Upgrading: `balances` and `holdings` now include Canton Coin, and `Amulet` sorts before most
  instrument ids, so a picker that takes the first balance may now default to Canton Coin. Filter
  pickers for transfer, burn and pre-approval with `isCantonCoin` (`balance.source === 'amulet'`):

  ```ts
  const sendable = state.balances.filter((b) => !isCantonCoin(b) && Number(b.unlocked) > 0);
  ```

- New fields stay optional for objects built by hand: `Holding.source` and
  `InstrumentBalance.source` (absent reads as `'da-registry'`), `TransferOffer.registry` (absent:
  `'da'`), `TransferOffer.expired` (absent: not expired), `TransferOffer.lockedHoldingCid`,
  `InstrumentBalance.lockedInExpiredOffers` and `.lockedInExpiredLocks`, `Holding.lockExpiresAt`,
  `MintOffer.memo` and `BurnRequest.memo` (absent: `null`) and `WalletState.cantonCoinUnavailable`.
  The wallet always sets them (`lockedHoldingCid` only for a Canton Coin offer, `lockExpiresAt` only
  for a Canton Coin lock with an absolute expiry).
- To send Canton Coin from a provider validator (a faucet), use
  `ExternalPartyWalletBridge.offerProviderTransfer({ receiverPartyId, amount, idempotencyKey, expiresAt })`:
  it settles at once when the receiver pre-approved Canton Coin, else it lands as an offer in the
  receiver's inbox above. The validator deduplicates the key only within its deduplication window
  (24 h by default), so persist the key with its `expiresAt` (at most that window away), retry with
  both unchanged, and keep your own record of the outcome if a key must never send twice.

### The ownership routes

`store.act({ type: 'proveOwnership', challengeUrl, verifyUrl })` is the browser half of an ownership
check: it posts the connected `{ network, partyId }` to `challengeUrl`, has the wallet sign the
challenge, and posts the proof to `verifyUrl`. A verdict that did not verify is a failed outcome
(`not-verified`). The server half is `createWalletOwnershipChallenger` (Node only, from the package
root) behind two routes:

```ts
// app/api/ownership/challenge/route.ts and verify/route.ts (Node). Authenticate first.
import { createWalletOwnershipChallenger } from '@fairmint/canton-node-sdk';

const challenger = createWalletOwnershipChallenger({
  secret,
  purpose: 'my-dapp:wallet-ownership:v1',
});

export async function POST(request: Request): Promise<Response> {
  const user = await requireUser(request); // yours: session, CSRF
  return challenger.handleChallenge(request, { subject: user.id });
  // verify/route.ts: challenger.handleVerify(request, { subject: user.id, onVerdict: (verdict, partyId) => log(...) })
}
```

### The wallet proof format (`wallet-proof-v1`)

A second message format, the same shape as apiv2's CNTN tokenization wallet proof, so a page signs
one format whichever Fairmint server checks it: one line of JSON with the keys in this order.

```json
{
  "domain": "fairmint:tokenization-wallet-proof:v1",
  "network": "devnet",
  "partyId": "hint::1220…",
  "investorContext": "user-1",
  "idempotencyKey": "<nonce>",
  "issuedAt": "2026-11-24T10:00:00.000Z",
  "expiresAt": "2026-11-24T10:05:00.000Z"
}
```

- `buildWalletProofMessage(fields)` and `parseWalletProofMessage(text)` (browser-safe, from
  `@fairmint/canton-node-sdk/wallets`) write and read it. Parsing is strict: the exact key set and
  order, string values, ISO-8601 times with an offset, `expiresAt` after `issuedAt`, and the text
  must be byte for byte what `JSON.stringify` writes for those fields.
- `verifyWalletProof({ proof, expected: { domain, network, partyId, investorContext?, idempotencyKey? }, now?, maxLifetimeMs?, maxSkewMs? })`
  (Node only, package root) checks the fields against the server's values, `issuedAt <= now + 60 s`,
  `expiresAt > now`, a lifetime of at most 10 minutes, the key's fingerprint against the party's
  namespace, and the Ed25519 signature over the exact bytes. It answers like
  `verifyWalletOwnership`: `{ verified: true, ...fields, publicKeyFingerprint }` or
  `{ verified: false, reason, message }`.
- The challenger issues it on request: `issue({ ..., format: 'wallet-proof-v1', proofDomain })` or
  `handleChallenge(request, { subject, format: 'wallet-proof-v1', proofDomain })` (`proofDomain`
  defaults to `purpose`). The challenge answer is
  `{ format: 'wallet-proof-v1', message, fields, token }`: `idempotencyKey` is the challenge's nonce
  (its reference) and `investorContext` the subject. The token says which format a challenge used,
  so `handleVerify` and `verify` need no option. The text format stays the default.
- In the browser, `requestWalletOwnershipVerdict` (and the store's `proveOwnership`) accepts either
  answer. For `wallet-proof-v1` it calls `proveWalletProof(connection, { message, fields })`, which
  refuses a message that does not parse, names another party or network, differs from `fields`, or
  has expired, and then signs exactly `message`. The signed
  `{ partyId, publicKey, message, signature }` reaches a page through `onProof`, or as `proof` on
  the store's `proveOwnership` result. `proveWalletProof` returns `publicKey` and `signature` as
  standard base64 whatever the wallet gave (Loop's hex, or base64), a raw 32-byte key or a DER key
  alike, so the proof a page shows for copying verifies with a server that decodes base64 only
  (apiv2's CNTN verifier); `verifyWalletProof` still accepts hex or base64.

### Proving wallet ownership

A connected wallet only tells the dApp a party id, which anyone can claim. To know the user controls
the party, the server issues a challenge, the wallet signs it, and the server verifies the
signature. A check in the browser proves nothing.

1. The server issues `{ domain, nonce, issuedAt, expiresAt, network? }`: its own host, a random
   single-use nonce it stores, and a short validity window (at most 10 minutes by default).
2. The browser calls `proveWalletOwnership(wallet, { challenge })` with the session's connected
   wallet. The wallet signs, as its primary account, a canonical text message: a fixed title, a
   statement that it is not a transaction and authorizes nothing, then the domain, party, network,
   nonce and times. Plain text with a fixed prefix can never be a Canton transaction or topology
   hash (34 binary bytes), which the same key signs.
3. The server calls
   `verifyWalletOwnership(proof, { expectedNonce, expectedDomain, expectedNetwork })` (Node only,
   from the package root, not the browser entry), then marks the nonce used.

`createWalletOwnershipChallenger({ secret, purpose })` does the server's part, and
`requestWalletOwnershipVerdict` (what `proveOwnership` runs) the browser's, both shown above:

- The challenge is stateless: a token `v1.<claims>.<MAC>`, HMAC-SHA256 under the key
  `HMAC-SHA256(secret, purpose)`, binds it to the subject (your signed-in user), the host and the
  party for 5 minutes (`ttlMs`), compared in constant time.
- The nonce is spent before the signature is checked, so each challenge gets exactly one verdict.
  `createMemoryNonceStore()` (the default) enforces that on one server instance only; pass a shared
  `nonceStore` for more.
- The host is the browser's `Origin` host only when it is the request's own host or one of
  `trustedOrigins` (`walletOwnershipDomain`); `x-forwarded-host` is never read.
- `handleChallenge` and `handleVerify` take a Fetch API `Request` and answer `{ data }`, or 400
  `{ error }` for bad JSON, a bad body or an untrusted `Origin`, always `no-store`. Check the
  caller's session and your CSRF rules before calling them. `issue` and `verify` serve callers that
  do their own HTTP. The verdict reports the signed network only as `claimedNetwork`.

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
- Keys: 64 hex characters (the raw key), or base64/base64url of the raw key or of its DER
  SubjectPublicKeyInfo. Signatures: 128 hex characters, or base64/base64url of 64 bytes. ECDSA keys
  are refused.

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
[`@fairmint/canton-dev-tools@0.1.16`](https://www.npmjs.com/package/@fairmint/canton-dev-tools) (see
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
