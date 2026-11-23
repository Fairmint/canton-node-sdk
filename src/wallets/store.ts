/**
 * A token wallet page's state and actions over a `Cip103Session`: one DA token wallet per connected wallet, its ledger
 * snapshot, typed actions run one wallet call at a time, a reload after every write attempt, the outcome of the last
 * action with a sentence for the user, and a sticky warning for a write whose outcome is unknown.
 *
 * Observable for any UI framework: `subscribe` and `getSnapshot` (React: `useSyncExternalStore(store.subscribe,
 * store.getSnapshot, store.getSnapshot)`).
 */
import { anySignal } from './abort';
import { AMULET_INSTRUMENT_ID, CANTON_COIN_METADATA } from './amulet/constants';
import { notifyListeners } from './notify';
import type { CantonCoinOptions } from './amulet/registry';
import type { FetchLike, DaRegistryOptions } from './da-utilities/client';
import { describeWalletError, WalletError, type WalletErrorDescription } from './errors';
import { instrumentKey } from './holdings';
import { createWriteLatch, type WriteLatch, type WriteRunContext, type WriteRunOutcome } from './latch';
import { requestWalletOwnershipVerdict, type WalletOwnershipVerdict } from './ownership';
import type { Cip103Session, Cip103SessionState, ConnectedWallet } from './session';
import type { InstrumentId, SubmitResult } from './types';
import {
  createWallet,
  type BurnRequestResult,
  type TransferPlan,
  type TransferRequest,
  type TransferResult,
  type Wallet,
  type WalletCallOptions,
  type WalletOptions,
  type WalletState,
  type WithdrawExpiredResult,
} from './wallet';

/** What a page asks the store to do. `planTransfer` and `proveOwnership` only read; every other action is a write. */
export type WalletAction =
  | { readonly type: 'acceptMintOffer' | 'rejectMintOffer'; readonly mintOfferCid: string }
  | {
      readonly type: 'acceptTransferOffer' | 'rejectTransferOffer' | 'withdrawTransferOffer';
      readonly transferOfferCid: string;
    }
  | {
      readonly type: 'requestBurn';
      readonly instrumentId: InstrumentId;
      readonly amount: string;
      readonly reference?: string;
      readonly executeBefore?: Date;
    }
  | { readonly type: 'cancelBurnRequest'; readonly burnRequestCid: string }
  /** Withdraw all of the party's expired outgoing offers of one token, unlocking what they keep locked. */
  | { readonly type: 'withdrawExpiredTransferOffers'; readonly instrumentId: InstrumentId }
  /**
   * Unlock everything of one token that no longer needs to be locked: its expired outgoing offers, and its expired
   * Canton Coin locks no offer names (`Wallet.reclaimLockedTokens`). Show it where `WalletToken.canReclaim`.
   */
  | { readonly type: 'reclaimLockedTokens'; readonly instrumentId: InstrumentId }
  /** Read-only; resolves with a plan to show. Send it with `submitTransfer`: its own `submit()` refuses. */
  | { readonly type: 'planTransfer'; readonly request: TransferRequest }
  | { readonly type: 'submitTransfer'; readonly plan: TransferPlan }
  | {
      readonly type: 'createTransferPreapproval';
      readonly instrumentAdmin: string;
      readonly instrumentIds?: readonly string[];
    }
  | { readonly type: 'removeTransferPreapproval'; readonly preapprovalCid: string }
  | {
      readonly type: 'proveOwnership';
      /** Answers `POST { network, partyId }` with `{ data: WalletOwnershipChallengeResponse }`. */
      readonly challengeUrl: string;
      /** Answers `POST { token, proof }` with `{ data: WalletOwnershipVerdict }`. */
      readonly verifyUrl: string;
      readonly fetch?: FetchLike;
    };

/** What each action resolves with. A not-verified ownership verdict is a failure, so only a verified one returns. */
export interface WalletActionResults {
  readonly acceptMintOffer: SubmitResult;
  readonly rejectMintOffer: SubmitResult;
  readonly acceptTransferOffer: SubmitResult;
  readonly rejectTransferOffer: SubmitResult;
  readonly withdrawTransferOffer: SubmitResult;
  readonly withdrawExpiredTransferOffers: WithdrawExpiredResult;
  readonly reclaimLockedTokens: WithdrawExpiredResult;
  readonly requestBurn: BurnRequestResult;
  readonly cancelBurnRequest: SubmitResult;
  readonly planTransfer: TransferPlan;
  readonly submitTransfer: TransferResult;
  readonly createTransferPreapproval: SubmitResult;
  readonly removeTransferPreapproval: SubmitResult;
  readonly proveOwnership: Extract<WalletOwnershipVerdict, { readonly verified: true }>;
}

export type ActionResultOf<A extends WalletAction> = WalletActionResults[A['type']];

type ActionResult = WalletActionResults[keyof WalletActionResults];

/**
 * A stable key for an action: its type and the contract or instrument it acts on. Compare it with `view.running?.key`
 * to show a button's spinner.
 */
export function walletActionKey(action: WalletAction): string {
  switch (action.type) {
    case 'acceptMintOffer':
    case 'rejectMintOffer':
      return `${action.type}:${action.mintOfferCid}`;
    case 'acceptTransferOffer':
    case 'rejectTransferOffer':
    case 'withdrawTransferOffer':
      return `${action.type}:${action.transferOfferCid}`;
    case 'requestBurn':
    case 'withdrawExpiredTransferOffers':
    case 'reclaimLockedTokens':
      return `${action.type}:${instrumentKey(action.instrumentId)}`;
    case 'cancelBurnRequest':
      return `${action.type}:${action.burnRequestCid}`;
    case 'planTransfer':
      return `${action.type}:${instrumentKey(action.request.instrumentId)}`;
    case 'submitTransfer':
      return `${action.type}:${instrumentKey(action.plan.request.instrumentId)}`;
    case 'createTransferPreapproval':
      return `${action.type}:${action.instrumentAdmin}`;
    case 'removeTransferPreapproval':
      return `${action.type}:${action.preapprovalCid}`;
    case 'proveOwnership':
      return action.type;
  }
}

const READ_ONLY: ReadonlySet<WalletAction['type']> = new Set(['planTransfer', 'proveOwnership']);

/**
 * Whether `store.act(action)` would run it now: the store is `ready`, not busy, and, for a write, the store is not
 * read-only and no outcome is unknown. Use it to enable the action's button.
 */
export function canAct(view: WalletView, action: WalletAction): boolean {
  return (
    view.ready && !view.busy && (READ_ONLY.has(action.type) || (view.readOnly === null && view.unknownOutcome === null))
  );
}

/**
 * Why {@link actionState} disables an action:
 *
 * - `disconnected`: no wallet is connected (or there is no view yet);
 * - `reconnecting`: the session is connecting (a reconnect or a switch of wallet);
 * - `not-ready`: connected, but the token wallet is not open (`view.loadError` may say why);
 * - `read-only`: the app's write gate is closed (`view.readOnly` holds its value); writes only;
 * - `busy`: a wallet call is in flight, a load is queued, or another writer holds the shared latch;
 * - `unknown-outcome`: a write's outcome is unknown, so writes wait until `acknowledgeUnknownOutcome()`.
 */
export type WalletActionBlocker =
  'disconnected' | 'reconnecting' | 'not-ready' | 'read-only' | 'busy' | 'unknown-outcome';

/**
 * Whether `store.act(action)` would run it now (as {@link canAct}), and when not, the first reason, in the order listed
 * by {@link WalletActionBlocker}. `view` may be null (no store yet), which reads as `disconnected`. Use `reason` to say
 * why a button is disabled; the page words it.
 */
export function actionState(
  view: WalletView | null,
  action: WalletAction
): { readonly enabled: boolean; readonly reason: WalletActionBlocker | null } {
  if (view !== null && canAct(view, action)) return { enabled: true, reason: null };
  const reason: WalletActionBlocker =
    view === null
      ? 'disconnected'
      : view.session.status === 'connecting'
        ? 'reconnecting'
        : view.wallet === null
          ? 'disconnected'
          : !view.ready
            ? 'not-ready'
            : view.readOnly !== null && !READ_ONLY.has(action.type)
              ? 'read-only'
              : view.busy
                ? 'busy'
                : 'unknown-outcome';
  return { enabled: false, reason };
}

/**
 * The failures a submission itself reports (`WalletSubmitError`). The wallet throws every other failure before it
 * submits, so nothing was sent.
 */
const SUBMISSION_FAILURES: ReadonlySet<WalletErrorDescription['kind']> = new Set([
  'declined',
  'not-committed',
  'outcome-unknown',
]);

/** How the last action that had something to say ended, for the party it ran as. */
export type ActionOutcome =
  | {
      readonly action: WalletAction;
      readonly key: string;
      readonly partyId: string;
      readonly status: 'succeeded';
      readonly message: string;
    }
  | {
      readonly action: WalletAction;
      readonly key: string;
      readonly partyId: string;
      readonly status: 'failed';
      readonly error: WalletErrorDescription;
    };

/** A write whose outcome is unknown (`outcome-unknown`): it may have committed. Check the wallet before trying again. */
export interface UnknownOutcome {
  readonly action: WalletAction;
  readonly key: string;
  readonly partyId: string;
  readonly message: string;
  /** The command id it was submitted with, when the submission reported one. */
  readonly commandId?: string;
  /** A redemption's reference, to look the burn request up before filing another. */
  readonly burnReference?: string;
}

/** Something to show the user; render `view.notices` in one place. */
export interface WalletNotice {
  /** Stable per kind of notice: a React `key`. */
  readonly key: string;
  readonly level: 'success' | 'error' | 'warning' | 'info';
  readonly title?: string;
  readonly message: string;
  /** Offer a Retry button that calls `store.refresh()`. */
  readonly retry?: true;
  /** Offer a button that calls `store.acknowledgeUnknownOutcome()` once the user checked the wallet. */
  readonly acknowledge?: true;
}

/** Why {@link WalletView.busy} is true. */
export type WalletBusyReason = 'action' | 'load' | 'run';

export interface WalletView {
  readonly session: Cip103SessionState;
  /** The connected wallet the state belongs to (null when disconnected). */
  readonly wallet: ConnectedWallet | null;
  /**
   * A token wallet is open for `wallet`, so actions can run. False while disconnected, and when the token wallet could
   * not be built (an invalid `registry` option; `loadError` says why).
   */
  readonly ready: boolean;
  /**
   * Ledger state from one snapshot. Null until the first load answers, and cleared when a load fails or the wallet
   * changes.
   */
  readonly state: WalletState | null;
  /** A load for the current wallet is in flight, or queued behind the wallet call in flight. */
  readonly loading: boolean;
  /** The last load's failure. A rate limit has kind `rate-limited`, so offer `refresh()` after a moment. */
  readonly loadError: WalletErrorDescription | null;
  /** The running action (`key` is its `walletActionKey`). */
  readonly running: { readonly action: WalletAction; readonly key: string } | null;
  /**
   * True while any wallet call is in flight, a load is queued, or another writer holds the shared latch (a `run()`):
   * disable every action button. `act()` refuses meanwhile, so only one wallet call is ever in flight.
   */
  readonly busy: boolean;
  /**
   * Why `busy` is true (null when it is not): `action` (a store action holds the latch), `run` (another writer's
   * `run()` holds it; `busyLabel` names it) or `load` (a snapshot load is in flight or queued), in that precedence.
   */
  readonly busyReason: WalletBusyReason | null;
  /** The latch holder's label while `busyReason` is `action` or `run`, else null. */
  readonly busyLabel: string | null;
  /**
   * What a page renders: `state` when it is non-null; otherwise, while a load runs or the session is connecting, the
   * last state of the same `retainKey` (see {@link WalletStoreOptions.retainKey}); otherwise null.
   */
  readonly shown: WalletState | null;
  /** `shown` is a held snapshot, not `state`. */
  readonly stale: boolean;
  /** The app's write gate in force (`WalletStoreOptions.readOnly`, `setReadOnly`), or null when writes are open. */
  readonly readOnly: string | null;
  /**
   * The last action that had something to say: a write's result or failure, an ownership verdict, a plan that failed. A
   * plan that succeeded leaves it as it was (its result is the plan). Cleared when the wallet changes.
   */
  readonly outcome: ActionOutcome | null;
  /**
   * A write whose outcome is unknown. It stays, across later actions and wallet changes, until
   * `acknowledgeUnknownOutcome()`, and meanwhile `act()` refuses every write: disable write buttons while it is set.
   */
  readonly unknownOutcome: UnknownOutcome | null;
  /** The session error, the unknown outcome, the load error and the last outcome, as sentences to show. */
  readonly notices: readonly WalletNotice[];
}

export interface WalletStore {
  subscribe(listener: () => void): () => void;
  /** The current view; the same object until it changes (for `useSyncExternalStore`). */
  getSnapshot(): WalletView;
  /**
   * Run one action for the connected wallet. Resolves null without doing anything while busy or disconnected, or for a
   * write while `view.unknownOutcome` is set (checked synchronously, so a double click is refused at once). A write is
   * followed by a reload, also when it failed, since a failed write may have committed; the store stays busy until that
   * reload answers. Resolves with the action's result when it succeeded for a wallet that is still current, else null
   * (see `view.outcome` and `view.unknownOutcome`).
   *
   * A write that settles after its session ended is recorded by what is known: a result as `succeeded` for its party, a
   * certain failure as `failed`, an unknown outcome as `unknownOutcome`, and a failure before anything was submitted
   * not at all. `submitTransfer` sends only a plan this store's `planTransfer` made for the current wallet; any other
   * plan (another session, network or account, or a standalone wallet's) is refused with `invalid-input` before
   * anything is signed.
   *
   * `options.signal` cancels the action as `WalletCallOptions.signal` does (nothing is submitted once it fires before
   * the wallet is asked to sign; a submission already handed to the wallet runs to its outcome). `act()` itself never
   * rejects: a cancelled action is recorded as a failed `view.outcome` of kind `cancelled` and resolves null.
   * `dispose()` cancels the same way.
   */
  act<A extends WalletAction>(action: A, options?: WalletCallOptions): Promise<ActionResultOf<A> | null>;
  /** Reload the snapshot (the Retry button); queued behind the wallet call in flight. Ignored while disconnected. */
  refresh(): void;
  /** Clear `unknownOutcome` once the user checked the wallet. */
  acknowledgeUnknownOutcome(): void;
  /**
   * Runs `fn` under the store's latch (`latch.run(label, fn)`), for a write that is not a store action (a Canton Coin
   * prepare, sign and submit). Its signal is also aborted when the connected wallet changes (the store bumps the latch
   * on every wallet change) and on `dispose()`. A run does not set `outcome` or `unknownOutcome`: the caller reports
   * its {@link WriteRunOutcome}. A write here does not trigger a reload; call `refresh()`. Refused (`busy`) while a
   * store action or another run holds the latch, and (`disposed`) after `dispose()`.
   */
  run<T>(label: string, fn: (context: WriteRunContext) => Promise<T>): Promise<WriteRunOutcome<T>>;
  /** Changes the write gate (null opens it) and publishes a new view. */
  setReadOnly(reason: string | null): void;
  /**
   * Stop following the session; pending replies are dropped and no further view is published. Work in flight (an
   * action, a load) is cancelled through its `signal`, so nothing more is sent before a signature is requested.
   */
  dispose(): void;
}

export interface WalletStoreOptions {
  readonly session: Cip103Session;
  /** How each token wallet reaches DA's Utilities API (`createWallet`'s `registry`). */
  readonly registry?: DaRegistryOptions;
  /** Canton Coin for each token wallet (`createWallet`'s `cantonCoin`): on by default, `false` to read none. */
  readonly cantonCoin?: CantonCoinOptions | false;
  /** The latch the store shares with `run()` and the app's other writers. Default: a private one. */
  readonly latch?: WriteLatch;
  /**
   * The app's write gate, such as a server-supplied reason writes are off. While it is set, every write action is
   * refused; reads (`planTransfer`, `proveOwnership`) still run. The store does not interpret the value. Change it
   * later with `setReadOnly`.
   */
  readonly readOnly?: string | null;
  /**
   * The connection a ledger snapshot belongs to, for `shown`/`stale`. Two wallets with the same key (for example a
   * rebuilt provider for the same party) keep the last snapshot on screen across the reconnect. Read once per connected
   * wallet. Default: `wallet.key`, which keeps it only across reloads of one connection.
   */
  readonly retainKey?: (wallet: ConnectedWallet) => string;
  /**
   * While the session is `connecting`, the retain key of the connection being made, or null when it is not known. The
   * held snapshot stays shown (`stale`) during a connect only when this names its key, so a connect to another wallet
   * or party never shows the previous one's holdings. Read on every view while connecting. Default: none, so nothing is
   * held while the session connects.
   */
  readonly connectingRetainKey?: () => string | null;
}

/** A test hook beside {@link WalletStoreOptions}; not part of the public options. */
export interface WalletStoreInternalOptions extends WalletStoreOptions {
  /** Defaults to `createWallet`. */
  readonly openWallet?: (options: WalletOptions) => Wallet;
}

/** How an action settled: its result and the sentence for the user (null: nothing to say), or why it failed. */
type Settled =
  | { readonly ok: true; readonly result: ActionResult; readonly message: string | null }
  | {
      readonly ok: false;
      readonly error: WalletErrorDescription;
      /** Something committed before the failure (a reclaim that stopped part way): always reported. */
      readonly committed?: true;
    };

const update = (result: SubmitResult): string => `(update ${result.updateId})`;

/** What a transfer of each kind did, for the user. */
const TRANSFER_SENTENCES: Readonly<Record<TransferResult['kind'], string>> = {
  direct: 'Sent: the tokens moved to the receiver',
  offer: 'Transfer offer sent: the receiver must accept it before it expires',
  self: 'Self-transfer done',
};

/**
 * The plans one store handed out, each with the connected wallet it was made for and the token wallet's own plan behind
 * it. `submitTransfer` sends only a plan this store made for the wallet it runs for: a plan of another store, session,
 * network or standalone wallet would skip this store's checks or submit through another wallet.
 */
type StorePlans = WeakMap<TransferPlan, { readonly wallet: ConnectedWallet; readonly plan: TransferPlan }>;

/** Submitting a store's plan directly would skip the store's checks (one call at a time, the unknown-outcome lock). */
// eslint-disable-next-line @typescript-eslint/require-await -- TransferPlan.submit is async: it rejects, never throws
async function submitThroughStore(): Promise<never> {
  throw new WalletError('invalid-input', "Send this plan with store.act({ type: 'submitTransfer', plan })");
}

/**
 * A reclaimed token's name for the user: Canton Coin's symbol when the wallet confirmed what it reclaimed as Canton
 * Coin (an offer under Canton Coin's registry, or a released lock, which only Canton Coin has), else the instrument id.
 * The id alone does not tell: a DA registrar may issue an `Amulet` of its own.
 */
function reclaimedTokenLabel(instrumentId: InstrumentId, result: WithdrawExpiredResult): string {
  const cantonCoin =
    instrumentId.id === AMULET_INSTRUMENT_ID &&
    (result.released.length > 0 || result.withdrawn.some((offer) => offer.registry === 'amulet'));
  return cantonCoin ? CANTON_COIN_METADATA.symbol : instrumentId.id;
}

const plural = (count: number, noun: string): string => `${count} ${noun}${count === 1 ? '' : 's'}`;

/**
 * How a reclaim settled: success with what it did, or, when a submission after the first failed, that failure (so an
 * unknown outcome still locks writes) with what had already committed in its message.
 */
/**
 * The reason a partial reclaim stopped, without the "nothing was submitted" a describeWalletError message may carry:
 * the steps before it did commit, so only the failed step and the ones after it were not submitted.
 */
function stoppedReason(message: string): string {
  // Replace the clause with a sentence end, so the sentences around it keep their break.
  const reason = message
    .replace(/(?:[.;,]\s*)?\bnothing (?:else )?was submitted(?: or signed)?\.?/giu, '. ')
    .replace(/\s{2,}/gu, ' ')
    .trim()
    .replace(/^\.\s*/u, '');
  if (reason === '') return 'nothing after that was submitted.';
  return `${/[.!?]$/u.test(reason) ? reason : `${reason}.`} Nothing after that was submitted.`;
}

function reclaimSettled(result: WithdrawExpiredResult, label: string): Settled {
  const parts = [
    ...(result.withdrawn.length > 0 ? [`withdrew ${plural(result.withdrawn.length, 'expired transfer offer')}`] : []),
    ...(result.released.length > 0 ? [`released ${plural(result.released.length, 'expired lock')}`] : []),
  ];
  const done = `${parts.join(' and ')} of ${label}`;
  const committed = [...result.withdrawn, ...result.released];
  const last = committed[committed.length - 1];
  if (result.failed !== undefined) {
    const error = describeWalletError(result.failed.error);
    const skipped = result.notAttempted.length > 0 ? ` ${result.notAttempted.length} more not attempted.` : '';
    return {
      ok: false,
      error: { ...error, message: `The wallet ${done}, then stopped: ${stoppedReason(error.message)}${skipped}` },
      committed: true,
    };
  }
  const sentence = done.charAt(0).toUpperCase() + done.slice(1);
  return {
    ok: true,
    result,
    message: `${sentence}; those tokens are unlocked${last === undefined ? '' : ` ${update(last)}`}.`,
  };
}

/** Run `action` with `tokens` for `wallet`; throws what the wallet throws. */
async function perform(
  plans: StorePlans,
  tokens: Wallet,
  wallet: ConnectedWallet,
  action: WalletAction,
  signal: AbortSignal | undefined
): Promise<Settled> {
  const call: WalletCallOptions = signal === undefined ? {} : { signal };
  const written = (result: SubmitResult, sentence: string): Settled => ({
    ok: true,
    result,
    message: `${sentence} ${update(result)}.`,
  });
  switch (action.type) {
    case 'acceptMintOffer':
      return written(await tokens.acceptMintOffer(action.mintOfferCid, call), 'Mint offer accepted');
    case 'rejectMintOffer':
      return written(await tokens.rejectMintOffer(action.mintOfferCid, call), 'Mint offer rejected');
    case 'acceptTransferOffer':
      return written(await tokens.acceptTransferOffer(action.transferOfferCid, call), 'Transfer accepted');
    case 'rejectTransferOffer':
      return written(await tokens.rejectTransferOffer(action.transferOfferCid, call), 'Transfer offer rejected');
    case 'withdrawTransferOffer':
      return written(
        await tokens.withdrawTransferOffer(action.transferOfferCid, call),
        'Transfer offer withdrawn; its tokens are unlocked'
      );
    case 'withdrawExpiredTransferOffers':
    case 'reclaimLockedTokens': {
      const result =
        action.type === 'reclaimLockedTokens'
          ? await tokens.reclaimLockedTokens(action.instrumentId, call)
          : await tokens.withdrawExpiredTransferOffers(action.instrumentId, call);
      return reclaimSettled(result, reclaimedTokenLabel(action.instrumentId, result));
    }
    case 'requestBurn': {
      const { instrumentId, amount, reference, executeBefore } = action;
      const result = await tokens.requestBurn(
        {
          instrumentId,
          amount,
          ...(reference !== undefined && { reference }),
          ...(executeBefore !== undefined && { executeBefore }),
        },
        call
      );
      return {
        ok: true,
        result,
        message: `Redemption ${result.reference} requested ${update(result)}. The registrar burns the amount or returns it.`,
      };
    }
    case 'cancelBurnRequest':
      return written(
        await tokens.cancelBurnRequest(action.burnRequestCid, call),
        'Redemption cancelled; the amount is unlocked'
      );
    case 'planTransfer': {
      const plan = await tokens.planTransfer(action.request, call);
      const { kind, description, partyId, request } = plan;
      const handed: TransferPlan = Object.freeze({ kind, description, partyId, request, submit: submitThroughStore });
      plans.set(handed, { wallet, plan });
      return { ok: true, result: handed, message: null };
    }
    case 'submitTransfer': {
      const planned = plans.get(action.plan);
      if (planned?.wallet !== wallet) {
        throw new WalletError(
          'invalid-input',
          'This transfer was planned for another wallet connection; plan it again before sending'
        );
      }
      const result = await planned.plan.submit(call);
      return written(result, TRANSFER_SENTENCES[result.kind]);
    }
    case 'createTransferPreapproval': {
      const { instrumentAdmin, instrumentIds } = action;
      return written(
        await tokens.createTransferPreapproval(
          {
            instrumentAdmin,
            ...(instrumentIds !== undefined && { instrumentIds }),
          },
          call
        ),
        instrumentIds === undefined || instrumentIds.length === 0
          ? `Transfer preapproval created: transfers of ${instrumentAdmin}'s instruments now complete at once`
          : `Transfer preapproval created: transfers of ${instrumentIds.join(', ')} by ${instrumentAdmin} now complete at once`
      );
    }
    case 'removeTransferPreapproval':
      return written(
        await tokens.removeTransferPreapproval(action.preapprovalCid, call),
        'Transfer preapproval removed'
      );
    case 'proveOwnership': {
      const { challengeUrl, verifyUrl, fetch } = action;
      const verdict = await requestWalletOwnershipVerdict(wallet, {
        challengeUrl,
        verifyUrl,
        ...(fetch !== undefined && { fetch }),
        ...(signal !== undefined && { signal }),
      });
      if (!verdict.verified) return { ok: false, error: { kind: 'not-verified', message: verdict.message } };
      return {
        ok: true,
        result: verdict,
        message: `Verified: this wallet holds the key of ${verdict.partyId} (key fingerprint ${verdict.publicKeyFingerprint}).`,
      };
    }
  }
}

/** `message`, naming `partyId` when the view shows another wallet (or none). */
function forParty(message: string, partyId: string, current: ConnectedWallet | null): string {
  return current?.partyId === partyId ? message : `${message} (party ${partyId})`;
}

/**
 * The observable state and actions of a token wallet page over `session`. Each new `ConnectedWallet` gets its own token
 * wallet (`createWallet` on the session's network, bound to the session by `isActive`) and a fresh load.
 *
 * One wallet call at a time: a latch counts every call in flight (actions and loads, of the current wallet or a
 * previous one, since a dropped reply does not cancel its request). `act()` refuses while it is held. A load asked for
 * meanwhile (a new wallet's first load, a Retry, the reload after a write) is queued; queued loads coalesce into one,
 * which runs for the wallet current when the latch frees. A wallet call that never settles holds the latch.
 */
export function createWalletStore(options: WalletStoreOptions): WalletStore {
  const { session, registry, cantonCoin, openWallet = createWallet } = options as WalletStoreInternalOptions;
  const latch = options.latch ?? createWriteLatch();
  const retainKey = options.retainKey ?? ((connected: ConnectedWallet) => connected.key);
  const connectingRetainKey = options.connectingRetainKey ?? (() => null);
  const listeners = new Set<() => void>();
  const plans: StorePlans = new WeakMap();

  let sessionState = session.getSnapshot();
  let wallet: ConnectedWallet | null = null;
  let tokens: Wallet | null = null;
  let state: WalletState | null = null;
  let loadError: WalletErrorDescription | null = null;
  // Every load and wallet change takes a new number; a load's reply counts only while its number is the latest.
  let generation = 0;
  // Execution latch: wallet calls (actions and loads, of any wallet) asked and not yet settled.
  let inFlight = 0;
  // A load for the current wallet waits for the latch (one at most: queued loads coalesce).
  let queued = false;
  // A load for the current wallet is in flight.
  let loadInFlight = false;
  let running: { readonly action: WalletAction; readonly key: string; readonly wallet: ConnectedWallet } | null = null;
  let outcome: ActionOutcome | null = null;
  let unknownOutcome: UnknownOutcome | null = null;
  let disposed = false;
  let readOnly: string | null = options.readOnly ?? null;
  // A store action holds (or is taking) the latch: its busy reason is `action`, not someone else's `run`.
  let acting = false;
  // The current wallet's retain key, and the last snapshot shown for a key (kept across a reconnect of the same key).
  let walletRetainKey: string | null = null;
  let held: { readonly key: string; readonly value: WalletState } | null = null;
  // Aborted by dispose(): cancels the store's work in flight (combined with each caller's own signal).
  const lifetime = new AbortController();
  let view = buildView();

  function notices(): WalletNotice[] {
    const list: WalletNotice[] = [];
    if (sessionState.status === 'disconnected' && sessionState.error !== null) {
      const { error } = sessionState;
      list.push({ key: 'session', level: error.kind === 'declined' ? 'info' : 'error', message: error.message });
    }
    if (unknownOutcome !== null) {
      list.push({
        key: 'unknown-outcome',
        level: 'warning',
        title: 'Outcome unknown',
        message: forParty(unknownOutcome.message, unknownOutcome.partyId, wallet),
        acknowledge: true,
      });
    }
    if (loadError !== null) {
      const rateLimited = loadError.kind === 'rate-limited';
      list.push({
        key: 'load',
        level: rateLimited ? 'warning' : 'error',
        title: rateLimited ? 'The wallet is busy' : 'The wallet could not be read',
        message: loadError.message,
        ...(tokens !== null && { retry: true as const }),
      });
    }
    if (state?.cantonCoinUnavailable === true) {
      list.push({
        key: 'canton-coin',
        level: 'warning',
        title: 'Canton Coin is not shown',
        message:
          "The Canton Coin registry (Scan) could not confirm Canton Coin's DSO party, so the wallet's Canton Coin and Canton Coin offers are left out; everything else is shown. Try again in a minute.",
        ...(tokens !== null && { retry: true as const }),
      });
    }
    if (outcome?.status === 'succeeded') {
      list.push({ key: 'outcome', level: 'success', message: forParty(outcome.message, outcome.partyId, wallet) });
    } else if (outcome?.status === 'failed') {
      list.push({
        key: 'outcome',
        level: outcome.error.kind === 'declined' ? 'info' : 'error',
        message: forParty(outcome.error.message, outcome.partyId, wallet),
      });
    }
    return list;
  }

  function busyReason(holder: string | null): WalletBusyReason | null {
    if (running !== null || acting) return 'action';
    if (holder !== null) return 'run';
    return inFlight > 0 || queued ? 'load' : null;
  }

  /**
   * What to render: the live state, else the held one of the same retain key while a load or reconnect runs. While the
   * session reconnects there is no wallet yet; the held state stays only when `connectingRetainKey` names its key.
   */
  function retained(): { readonly shown: WalletState | null; readonly stale: boolean } {
    if (state !== null) {
      if (wallet !== null && walletRetainKey !== null) held = { key: walletRetainKey, value: state };
      return { shown: state, stale: false };
    }
    if (wallet === null) {
      if (sessionState.status !== 'connecting') {
        held = null;
        return { shown: null, stale: false };
      }
      let target: string | null;
      try {
        target = connectingRetainKey();
      } catch {
        target = null;
      }
      return held !== null && target !== null && held.key === target
        ? { shown: held.value, stale: true }
        : { shown: null, stale: false };
    }
    if (held !== null && held.key === walletRetainKey && (loadInFlight || queued)) {
      return { shown: held.value, stale: true };
    }
    return { shown: null, stale: false };
  }

  function buildView(): WalletView {
    const holder = latch.getSnapshot().holder?.label ?? null;
    const reason = busyReason(holder);
    const { shown, stale } = retained();
    return {
      session: sessionState,
      wallet,
      ready: tokens !== null,
      state,
      loading: loadInFlight || queued,
      loadError,
      running: running === null ? null : { action: running.action, key: running.key },
      busy: reason !== null,
      busyReason: reason,
      busyLabel:
        reason === 'run' || reason === 'action' ? (holder ?? (running === null ? null : running.action.type)) : null,
      shown,
      stale,
      readOnly,
      outcome,
      unknownOutcome,
      notices: notices(),
    };
  }

  function publish(): void {
    if (disposed) return;
    view = buildView();
    notifyListeners(listeners);
  }

  /** Whether `candidate` is still the wallet this store and its session show. Read after an await. */
  function isCurrent(candidate: ConnectedWallet): boolean {
    return !disposed && candidate === wallet && session.isCurrent(candidate);
  }

  /** Ask for a load of the current wallet's snapshot: now when the latch is free, else once it frees. Publishes. */
  function requestLoad(): void {
    // A session listener that runs before this store's own may ask after the session left `wallet`.
    if (disposed || wallet === null || tokens === null || !session.isCurrent(wallet)) return;
    queued = true;
    drain();
  }

  /** Start the queued load if the latch is free, then publish. Called whenever the latch may have freed. */
  function drain(): void {
    if (disposed) return;
    // A wallet the session has left (also a disposed session, which publishes nothing) gets no load.
    if (queued && wallet !== null && !session.isCurrent(wallet)) queued = false;
    if (queued && inFlight === 0 && wallet !== null && tokens !== null) {
      queued = false;
      startLoad(wallet, tokens);
    }
    publish();
  }

  /** Load `forWallet`'s snapshot, holding the latch until the wallet answers; the reply is dropped once superseded. */
  function startLoad(forWallet: ConnectedWallet, forTokens: Wallet): void {
    const attempt = ++generation;
    inFlight += 1;
    loadInFlight = true;
    const current = (): boolean =>
      !disposed && attempt === generation && forWallet === wallet && session.isCurrent(forWallet);
    void (async () => {
      let next: { readonly ok: true; readonly snapshot: WalletState } | { readonly ok: false; readonly error: unknown };
      try {
        next = { ok: true, snapshot: await forTokens.loadState({ signal: lifetime.signal }) };
      } catch (error) {
        next = { ok: false, error };
      }
      inFlight -= 1;
      if (disposed) return;
      if (attempt === generation) loadInFlight = false;
      if (current()) {
        if (next.ok) {
          state = next.snapshot;
          loadError = null;
        } else {
          state = null; // nothing is offered from a stale snapshot
          loadError = describeWalletError(next.error);
        }
      }
      drain();
    })();
  }

  /** Follow the session: a new connected wallet gets a new token wallet, cleared state and a fresh load. */
  function onSession(): void {
    if (disposed) return;
    sessionState = session.getSnapshot();
    const next = sessionState.status === 'connected' ? sessionState.wallet : null;
    if (next === wallet) {
      publish();
      return;
    }
    wallet = next;
    walletRetainKey = null;
    if (next !== null) {
      try {
        walletRetainKey = retainKey(next);
      } catch {
        walletRetainKey = next.key;
      }
    }
    generation += 1; // drop the previous wallet's load reply (its call still holds the latch until it settles)
    queued = false;
    loadInFlight = false;
    state = null;
    loadError = null;
    outcome = null;
    tokens = null;
    // Runs started for the previous wallet are abandoned: their signals abort, so nothing more is sent for it. Bumped
    // only once the previous wallet's state is cleared: the bump publishes (the store follows the latch), and a view
    // built part way through would show that state under the new wallet.
    latch.bump();
    if (next !== null) {
      try {
        tokens = openWallet({
          provider: next.provider,
          partyId: next.partyId,
          network: next.network,
          ...(registry !== undefined && { registry }),
          ...(cantonCoin !== undefined && { cantonCoin }),
          isActive: () => session.isCurrent(next),
        });
      } catch (error) {
        // An invalid `registry` option: the wallet is connected but cannot act; say why instead of loading forever.
        loadError = describeWalletError(error);
      }
    }
    if (tokens === null) publish();
    else requestLoad(); // queued while the previous wallet's call is in flight
  }

  /** Record how an action settled; `live`: its wallet is still the current one. */
  function record(ran: NonNullable<typeof running>, settled: Settled, live: boolean): void {
    const { action, key } = ran;
    const { partyId } = ran.wallet;
    const reads = READ_ONLY.has(action.type);
    if (!live && reads) return; // nothing it did can commit, and its wallet is gone
    if (settled.ok) {
      if (settled.message !== null) outcome = { action, key, partyId, status: 'succeeded', message: settled.message };
      return;
    }
    const { error } = settled;
    if (error.kind === 'outcome-unknown') {
      unknownOutcome = {
        action,
        key,
        partyId,
        message: error.message,
        ...(error.commandId !== undefined && { commandId: error.commandId }),
        ...(error.burnReference !== undefined && { burnReference: error.burnReference }),
      };
      return;
    }
    // A failure before anything was submitted is nothing to report for a wallet that is gone; one after a reclaim
    // committed part of its work still is (for the party it ran as).
    if (!live && !SUBMISSION_FAILURES.has(error.kind) && settled.committed !== true) return;
    outcome = { action, key, partyId, status: 'failed', error };
  }

  const unsubscribe = session.subscribe(onSession);
  // The latch's holder is part of the view (`busy`, `busyReason`, `busyLabel`).
  const unsubscribeLatch = latch.subscribe(publish);
  onSession();

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    getSnapshot: () => view,

    async act<A extends WalletAction>(
      action: A,
      callOptions: WalletCallOptions = {}
    ): Promise<ActionResultOf<A> | null> {
      // Synchronous, before the first await: a second call in the same tick is refused.
      const ranFor = wallet;
      const ranTokens = tokens;
      if (disposed || inFlight > 0 || queued || ranFor === null || ranTokens === null) return null;
      // Another writer (a `run()`, a wallet setup step) holds the shared latch.
      if (latch.getSnapshot().holder !== null) return null;
      const write = !READ_ONLY.has(action.type);
      // The app's write gate; and until the user checked the wallet, a write could repeat the one whose outcome is
      // unknown.
      if (write && (readOnly !== null || unknownOutcome !== null)) return null;
      const ran = { action, key: walletActionKey(action), wallet: ranFor };
      inFlight += 1;
      running = ran;
      acting = true;
      // Takes the latch synchronously and runs the body at once, so a second call in this tick is refused.
      const ended = await latch.run(action.type, async (context): Promise<ActionResultOf<A> | null> => {
        publish();
        // A listener of that publish may have ended the session, switched the wallet or disposed the store: then the
        // action must not start, and queued work runs instead.
        if (!isCurrent(ranFor)) {
          inFlight -= 1;
          running = null;
          drain();
          return null;
        }

        let settled: Settled;
        const { signal, release } = anySignal(callOptions.signal, lifetime.signal, context.signal);
        try {
          settled = await perform(plans, ranTokens, ranFor, action, signal);
        } catch (error) {
          settled = { ok: false, error: describeWalletError(error) };
        } finally {
          release();
        }

        inFlight -= 1;
        running = null;
        const live = isCurrent(ranFor);
        record(ran, settled, live);
        // A failed write may still have committed, so reload after failures too. This only reads.
        if (live && write) queued = true;
        drain();
        // The result type follows from the action type (`perform`'s switch).
        return settled.ok ? (settled.result as ActionResultOf<A>) : null;
      });
      acting = false;
      if (ended.status === 'refused') {
        // Not taken (a disposed latch): the body never ran.
        inFlight -= 1;
        running = null;
        drain();
        return null;
      }
      publish();
      // Asked again: a listener of drain()'s publish may have ended the session or switched the wallet.
      return ended.status === 'done' && isCurrent(ranFor) ? ended.value : null;
    },

    async run<T>(label: string, fn: (context: WriteRunContext) => Promise<T>): Promise<WriteRunOutcome<T>> {
      if (disposed) return { status: 'refused', reason: 'disposed' };
      return latch.run(label, async (context) => {
        // Also aborted by dispose(); the store bumps the latch on every wallet change.
        const { signal, release } = anySignal(context.signal, lifetime.signal);
        try {
          return await fn({
            signal: signal ?? context.signal,
            isCurrent: () => !disposed && context.isCurrent(),
            markSubmitted: () => {
              context.markSubmitted();
            },
          });
        } finally {
          release();
        }
      });
    },

    setReadOnly(reason) {
      if (disposed || reason === readOnly) return;
      readOnly = reason;
      publish();
    },

    refresh() {
      requestLoad();
    },

    acknowledgeUnknownOutcome() {
      if (disposed || unknownOutcome === null) return;
      unknownOutcome = null;
      publish();
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      queued = false;
      lifetime.abort();
      unsubscribe();
      unsubscribeLatch();
      listeners.clear();
    },
  };
}
