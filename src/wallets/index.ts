/**
 * Browser-safe token standard (CIP-56) and DA Utility Registry holder actions through any CIP-0103 (Canton dApp API)
 * wallet provider. In a browser bundle import `@fairmint/canton-node-sdk/build/src/wallets/index.js`, which loads none
 * of the SDK's Node dependencies; the package root also exports it as the `Wallets` namespace (for Node).
 *
 * The surface is small on purpose: plug in a CIP-0103 provider and a registry (`createWallet`: CIP-56 actions with any
 * `TokenRegistry`, DA's mint, burn and preapproval actions with DA's client), a page's wallet session and observable
 * state (`createCip103Session`, `createTokenWalletStore`; framework-agnostic), the registry client, the ownership
 * proof's client side (`requestWalletOwnershipVerdict`, `proveWalletOwnership` and the message it signs; the server
 * side, `createWalletOwnershipChallenger` and `verifyWalletOwnership`, is Node-only and exported from the package
 * root), the read back-off options, the errors and their user-facing descriptions (`describeWalletError`), and the data
 * types. Command builders, parsers, error-code tables and the CIP-0103 client stay internal.
 */
export {
  createWallet,
  newBurnReference,
  type BurnRequestOptions,
  type BurnRequestResult,
  type Wallet,
  type WalletOptions,
  type WalletState,
} from './wallet';
export type { TransferOffers, TransferOptions, TransferPlan, TransferRequest, TransferResult } from './cip56-core';
export {
  cip103NetworkId,
  DEFAULT_READ_RETRY_DELAYS_MS,
  primaryPartyId,
  type Cip103Account,
  type Cip103EventListener,
  type Cip103LedgerApiParams,
  type Cip103PrepareExecuteParams,
  type Cip103Provider,
  type Cip103Request,
  type Cip103SignMessageParams,
  type WalletReadRetryOptions,
} from './cip103';
export {
  createCip103Session,
  type ConnectedWallet,
  type Cip103ConnectContext,
  type Cip103Session,
  type Cip103SessionState,
} from './session';
export {
  createTokenWalletStore,
  type ActionOutcome,
  type OpenTokenWalletContext,
  type TokenWalletStore,
  type TokenWalletStoreOptions,
  type TokenWalletView,
  type WalletActionContext,
} from './store';
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
export {
  createDaUtilitiesClient,
  isDaUtilitiesClient,
  type BurnRequestContextArgs,
  type DaNetwork,
  type DaUtilitiesClient,
  type DaUtilitiesClientOptions,
  type DaUtilitiesTarget,
  type FetchLike,
} from './da-utilities/client';
export type {
  ChoiceContext,
  ChoiceContextData,
  FactoryWithChoiceContext,
  ReadContracts,
  TokenRegistry,
  TransferFactory,
  TransferFactoryArgs,
  TransferInstructionAction,
  TransferKind,
  TransferSpec,
} from './token-registry';
export {
  describeWalletError,
  RegistryApiError,
  RegistryResponseError,
  TokenWalletError,
  WalletReadError,
  WalletSignError,
  WalletSubmitError,
  type TokenWalletErrorCode,
  type WalletErrorDescription,
  type WalletSignErrorReason,
  type WalletSubmitOutcome,
} from './errors';
export type { BurnRequest, MintOffer, TransferOffer } from './contracts';
export { instrumentKey, type Holding, type InstrumentBalance } from './holdings';
export type {
  ActiveContract,
  ContractFilter,
  CreateCommand,
  DisclosedContract,
  ExerciseCommand,
  InstrumentId,
  InterfaceView,
  LedgerCommand,
  SubmitResult,
  WalletSubmission,
} from './types';
export type { JsonArray, JsonObject, JsonPrimitive, JsonValue } from './json';
export { formatDecimalUnits, parseDecimalUnits } from './decimal';
