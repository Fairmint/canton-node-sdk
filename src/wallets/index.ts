/**
 * Browser-safe DA Utility Registry holder actions through any CIP-0103 (Canton dApp API) wallet provider. In a browser
 * bundle import `@fairmint/canton-node-sdk/wallets`, which loads none of the SDK's Node dependencies (the deep path
 * `@fairmint/canton-node-sdk/build/src/wallets/index.js` still works); the package root also exports it as the
 * `Wallets` namespace (for Node).
 *
 * - `discoverCip103Wallets()`: the CIP-0103 wallet extensions installed in the browser, each with `load(network)` that
 *   resolves its provider (the dApp SDK's announce handshake and message channel, no dependency).
 * - `createCip103Session({ network })`: which wallet is connected, as which party (`connect`, `restore`, `disconnect`).
 * - `createWalletStore({ session })`: the page's observable state, typed actions (`act`), notices to show.
 * - `createWallet(...)`: one party's token actions, for code that does not need the store.
 * - Canton Coin: `loadState()` lists the party's Canton Coin (Splice `Amulet` / `LockedAmulet`, read through the
 *   `HoldingV1` interface view) with its other holdings (`source: 'amulet'`); pass `cantonCoin: { dsoParty }` and/or `{
 *   registryUrl }` (Scan) to `createWallet` or `createWalletStore` to pin the DSO and label it (while a named DSO
 *   cannot be confirmed, no Canton Coin is listed). Canton Coin is read-only here.
 * - The ownership proof's browser half (`requestWalletOwnershipVerdict`); the server half
 *   (`createWalletOwnershipChallenger`, `verifyWalletOwnership`) is Node-only and exported from the package root.
 * - The errors, their guards (`isWalletError`, `isWalletSubmitError`, …: they match errors of any copy of this module,
 *   where `instanceof` does not), their user-facing descriptions (`describeWalletError`), and the data types.
 * - Cancellation: every call that reads, fetches or acts takes an optional `signal` (`WalletCallOptions`):
 *   `WalletStore.act`, `Cip103Session.connect` and `restore`, `DiscoveredWallet.load` included. `WalletStore.dispose()`
 *   cancels the store's own work in flight the same way.
 */
export {
  createCip103Session,
  type Cip103Session,
  type Cip103SessionOptions,
  type Cip103SessionState,
  type ConnectedWallet,
} from './session';
export {
  canAct,
  createWalletStore,
  walletActionKey,
  type ActionOutcome,
  type ActionResultOf,
  type UnknownOutcome,
  type WalletAction,
  type WalletActionResults,
  type WalletNotice,
  type WalletStore,
  type WalletStoreOptions,
  type WalletView,
} from './store';
export {
  createWallet,
  type BurnRequestOptions,
  type BurnRequestResult,
  type TransferOffers,
  type TransferPlan,
  type TransferPreapprovalOptions,
  type TransferRequest,
  type TransferResult,
  type Wallet,
  type WalletCallOptions,
  type WalletOptions,
  type WalletState,
} from './wallet';
export type { Cip103Connection, Cip103EventListener, Cip103Provider, Cip103Request } from './cip103';
export {
  discoverCip103Wallets,
  INJECTED_WALLET_ID,
  type Cip103DiscoveryHost,
  type DiscoverCip103WalletsOptions,
  type DiscoveredWallet,
} from './discovery';
export {
  buildWalletOwnershipMessage,
  proveWalletOwnership,
  requestWalletOwnershipVerdict,
  type ProveWalletOwnershipOptions,
  type RequestWalletOwnershipVerdictOptions,
  type WalletOwnershipChallenge,
  type WalletOwnershipChallengeFailure,
  type WalletOwnershipChallengeResponse,
  type WalletOwnershipFailure,
  type WalletOwnershipMessageFields,
  type WalletOwnershipProof,
  type WalletOwnershipVerdict,
} from './ownership';
export type { DaNetwork, DaRegistryOptions, FetchLike, TransferKind } from './da-utilities/client';
export {
  describeWalletError,
  isRegistryApiError,
  isRegistryResponseError,
  isWalletCancellation,
  isWalletError,
  isWalletReadError,
  isWalletSignError,
  isWalletSubmitError,
  RegistryApiError,
  RegistryResponseError,
  WalletError,
  WalletReadError,
  WalletSignError,
  WalletSubmitError,
  type WalletErrorCode,
  type WalletErrorDescription,
  type WalletSignErrorReason,
  type WalletSubmitCategory,
  type WalletSubmitErrorDetails,
  type WalletSubmitOutcome,
} from './errors';
export type { BurnRequest, MintOffer, TransferOffer, TransferPreapproval } from './contracts';
export type { Holding, HoldingSource, InstrumentBalance, InstrumentMetadata } from './holdings';
export { AMULET_INSTRUMENT_ID, AMULET_TEMPLATES, CANTON_COIN_METADATA } from './amulet';
export type { CantonCoinOptions } from './amulet-registry';
export {
  HOLDING_V1_INTERFACE_ID,
  readHoldingView,
  type HoldingView,
  type HoldingViewLock,
  type HoldingViewMetadata,
} from './holding-view';
export type { InstrumentId, SubmitResult } from './types';
export { formatDecimalUnits, parseDecimalUnits } from './decimal';
