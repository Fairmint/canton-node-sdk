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
 * - Canton Coin, on by default (`cantonCoin: false` on `createWallet` or `createWalletStore` turns it off): `loadState()`
 *   lists the party's `Amulet` and `LockedAmulet` holdings (read through the `HoldingV1` view, `source: 'amulet'`,
 *   `isCantonCoin`) and Canton Coin transfer offers (`registry: 'amulet'`), which can be accepted, rejected or
 *   withdrawn. Holdings and offers share one DSO lookup: the pinned `cantonCoin.dsoParty`, else the `adminId` of the
 *   registry (`cantonCoin.registryUrl`, SV-1's Scan of the network by default). While it is unconfirmed, no Canton Coin
 *   is listed and `cantonCoinUnavailable` is true. Canton Coin cannot be transferred, burnt or pre-approved through the
 *   wallet.
 * - `walletTokens(state)`: one entry per token (Canton Coin and DA Registry tokens alike) with its balances, offers,
 *   preapproval and honest `capabilities`, for one picker and one panel; `coveringPreapproval`, the rule
 *   `createTransferPreapproval` refuses `already-exists` by; expired offers (`TransferOffer.expired`,
 *   `InstrumentBalance.lockedInExpiredOffers`), expired Canton Coin locks no offer names
 *   (`InstrumentBalance.lockedInExpiredLocks`), and the `reclaimLockedTokens` action that unlocks both
 *   (`WalletToken.canReclaim` says when it applies).
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
  type WithdrawExpiredResult,
  type WithdrawnOffer,
  type ReleasedLock,
  type ReclaimLockedTokensResult,
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
export {
  coveringPreapproval,
  type BurnRequest,
  type MintOffer,
  type PreapprovalScope,
  type TransferOffer,
  type TransferOfferRegistry,
  type TransferPreapproval,
} from './contracts';
export {
  isTransferOfferExpired,
  expiredUnclaimedLocks,
  walletTokens,
  type TokenCapabilities,
  type WalletToken,
  type WalletTokensInput,
} from './tokens';
export {
  isCantonCoin,
  type Holding,
  type HoldingSource,
  type InstrumentBalance,
  type InstrumentMetadata,
} from './holdings';
export {
  AMULET_INSTRUMENT_ID,
  AMULET_REGISTRY_BASE_URLS,
  AMULET_TEMPLATES,
  CANTON_COIN_METADATA,
} from './amulet/constants';
export type { CantonCoinOptions } from './amulet/registry';
export {
  HOLDING_V1_INTERFACE_ID,
  readHoldingView,
  type HoldingView,
  type HoldingViewLock,
  type HoldingViewMetadata,
} from './holding-view';
export type { InstrumentId, SubmitResult } from './types';
export { formatDecimalUnits, parseDecimalUnits } from './decimal';
