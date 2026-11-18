/**
 * Browser-safe DA Utility Registry holder actions through any CIP-0103 (Canton dApp API) wallet provider. In a browser
 * bundle import `@fairmint/canton-node-sdk/build/src/wallets/index.js`, which loads none of the SDK's Node
 * dependencies; the package root also exports it as the `Wallets` namespace (for Node).
 *
 * - `createCip103Session({ network })`: which wallet is connected, as which party (`connect`, `restore`, `disconnect`).
 * - `createWalletStore({ session })`: the page's observable state, typed actions (`act`), notices to show.
 * - `createWallet(...)`: one party's token actions, for code that does not need the store.
 * - The ownership proof's browser half (`requestWalletOwnershipVerdict`); the server half
 *   (`createWalletOwnershipChallenger`, `verifyWalletOwnership`) is Node-only and exported from the package root.
 * - The errors, their user-facing descriptions (`describeWalletError`), and the data types.
 */
export {
  createCip103Session,
  type Cip103Session,
  type Cip103SessionOptions,
  type Cip103SessionState,
  type ConnectedWallet,
} from './session';
export {
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
  type WalletOptions,
  type WalletState,
} from './wallet';
export type { Cip103Connection, Cip103EventListener, Cip103Provider, Cip103Request } from './cip103';
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
  RegistryApiError,
  RegistryResponseError,
  WalletError,
  WalletReadError,
  WalletSignError,
  WalletSubmitError,
  type WalletErrorCode,
  type WalletErrorDescription,
  type WalletSignErrorReason,
  type WalletSubmitOutcome,
} from './errors';
export type { BurnRequest, MintOffer, TransferOffer, TransferPreapproval } from './contracts';
export type { Holding, InstrumentBalance, InstrumentMetadata } from './holdings';
export type { InstrumentId, SubmitResult } from './types';
export { formatDecimalUnits, parseDecimalUnits } from './decimal';
