/**
 * The wallets a page offers to connect, as options a `createWalletConnector` drives: a wallet whose CIP-0103 provider
 * is loaded on demand (Loop, a browser extension), or one the app builds over time through its own setup UI (Privy).
 * Options carry codes, never sentences: the page words them.
 */
import type { Cip103Provider } from './cip103';
import type { DaNetwork } from './da-utilities/client';
import { discoverCip103Wallets, type DiscoverCip103WalletsOptions } from './discovery';

/** Whether an option can connect on a network. */
export type WalletAvailability =
  | { readonly available: true }
  /** No DA network (null), or the option does not run on it. */
  | { readonly available: false; readonly reason: 'unsupported-network' }
  /** The option is set up for another network in this page load (Loop): a reload is needed. */
  | { readonly available: false; readonly reason: 'reload-required'; readonly setUpFor: DaNetwork }
  /** The app has not configured the option. */
  | { readonly available: false; readonly reason: 'not-configured' };

/** The display facts of an option. */
export interface WalletOptionInfo {
  /** Unique and stable across visits; it is what gets remembered. `loop`, `extension:<id>`, `privy`, ... */
  readonly key: string;
  /** For the page's icon and wording: `loop`, `extension`, `privy`, or an app's own kind. */
  readonly kind: string;
  readonly name: string;
  /** A data URL or URL of its icon. */
  readonly icon?: string;
}

/** A wallet whose CIP-0103 provider is loaded on demand: Loop, a browser extension. */
export interface LoadedWalletOption extends WalletOptionInfo {
  readonly mode: 'load';
  availability(network: DaNetwork): WalletAvailability;
  /** Resolves the provider. A rejection is shown as `load-failed`. `signal` aborts a load nobody waits for anymore. */
  load(network: DaNetwork, signal: AbortSignal): Promise<Cip103Provider>;
}

/**
 * A wallet the app builds over time, through its own setup UI (Privy: login, wallet, party). It offers a provider only
 * once its setup is done, and offers a new one whenever that setup changes.
 */
export interface LiveWalletOption extends WalletOptionInfo {
  readonly mode: 'live';
  availability(network: DaNetwork): WalletAvailability;
  readonly live: {
    subscribe(listener: () => void): () => void;
    /** The provider the option offers now, or null (not set up yet, or torn down). Compared by identity. */
    getProvider(): Cip103Provider | null;
    /**
     * What the provider signs as (Privy: the party id), so a rebuilt provider for the same party keeps the page mounted
     * and its snapshot shown. Null: use the session wallet's own key.
     */
    getRetainKey(): string | null;
    /**
     * The connector found this option remembered from an earlier visit. The option starts its own silent recovery
     * (Privy: one party load once logged in). Called at most once per connector.
     */
    restore(): void;
  };
}

/** A wallet the page offers. */
export type WalletOption = LoadedWalletOption | LiveWalletOption;

const AVAILABLE: WalletAvailability = Object.freeze({ available: true });

/**
 * The CIP-0103 browser extensions installed here (`discoverCip103Wallets`), as options keyed `extension:<id>` with kind
 * `extension`. Each is available on both DA networks.
 */
export async function extensionWalletOptions(options?: DiscoverCip103WalletsOptions): Promise<LoadedWalletOption[]> {
  return (await discoverCip103Wallets(options)).map((wallet): LoadedWalletOption => ({
    mode: 'load',
    key: `extension:${wallet.id}`,
    kind: 'extension',
    name: wallet.name,
    ...(wallet.icon !== undefined && { icon: wallet.icon }),
    availability: () => AVAILABLE,
    load: async (network, signal) => wallet.load(network, { signal }),
  }));
}
