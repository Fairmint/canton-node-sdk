/**
 * Loop (`@fivenorth/loop-sdk`) as a wallet option. node-sdk does not depend on Loop: the app passes the SDK's dynamic
 * import, and the option uses only the part {@link LoopSdkLike} names.
 */
import { awaitWithAbort, throwIfAborted } from './abort';
import type { Cip103Provider } from './cip103';
import type { DaNetwork } from './da-utilities/client';
import { WalletOptionError } from './errors';
import type { LoadedWalletOption, WalletAvailability } from './options';

/** The part of `@fivenorth/loop-sdk`'s `loop` the option uses, structurally. */
export interface LoopSdkLike {
  init(options: { readonly appName: string; readonly network: DaNetwork }): void;
  getCip103Provider(): Cip103Provider | Promise<Cip103Provider>;
}

/** {@link loopWalletOption}'s input. */
export interface LoopWalletOptionInput {
  /** The app name Loop shows the user. */
  readonly appName: string;
  /**
   * Loads Loop's SDK: a function that dynamically imports `@fivenorth/loop-sdk` and resolves its `loop` export (the
   * app's bundler then splits Loop into its own chunk).
   */
  readonly load: () => Promise<LoopSdkLike>;
}

/** Loop as a {@link LoadedWalletOption}, with the network it is set up for. */
export interface LoopWalletOption extends LoadedWalletOption {
  /** The network this page load set Loop up for, or null before the first `load` (or after a failed setup). */
  setUpFor(): DaNetwork | null;
}

const AVAILABLE: WalletAvailability = Object.freeze({ available: true });

/**
 * Loop as a `LoadedWalletOption` (`key: "loop"`, `kind: "loop"`, `name: "Loop"`). Loop serves one network per page load
 * (a second `init` answers 4900 until a reload), so the option remembers the first network it was set up for. Create it
 * once per page load, at module level. `availability(other)` then reports `reload-required` with `setUpFor`, and
 * `load(other)` rejects `WalletOptionError("reload-required")`. A failed setup is forgotten, so the next `load` tries
 * again (`WalletOptionError("setup-failed", { cause })`). Concurrent loads share one setup; a load's `signal` only
 * stops that caller waiting.
 */
export function loopWalletOption(input: LoopWalletOptionInput): LoopWalletOption {
  let setup: { readonly network: DaNetwork; readonly provider: Promise<Cip103Provider> } | null = null;

  async function start(network: DaNetwork): Promise<Cip103Provider> {
    const provider: Promise<Cip103Provider> = (async () => {
      const loop = await input.load();
      loop.init({ appName: input.appName, network });
      // Structurally a CIP-0103 provider (request, on, removeListener); node-sdk validates every reply.
      return loop.getCip103Provider();
    })().catch((error: unknown) => {
      if (setup?.provider === provider) setup = null; // the next attempt tries again
      throw new WalletOptionError('setup-failed', { requested: network, cause: error });
    });
    // A caller that stopped waiting leaves no unhandled rejection; the next caller sees the failure.
    provider.catch(() => undefined);
    setup = { network, provider };
    return provider;
  }

  return {
    mode: 'load',
    key: 'loop',
    kind: 'loop',
    name: 'Loop',
    availability(network) {
      if (setup !== null && setup.network !== network) {
        return { available: false, reason: 'reload-required', setUpFor: setup.network };
      }
      return AVAILABLE;
    },
    async load(network, signal) {
      if (setup !== null && setup.network !== network) {
        throw new WalletOptionError('reload-required', { setUpFor: setup.network, requested: network });
      }
      throwIfAborted(signal);
      const provider = setup?.provider ?? start(network);
      return awaitWithAbort(async () => provider, signal);
    },
    setUpFor: () => setup?.network ?? null,
  };
}
