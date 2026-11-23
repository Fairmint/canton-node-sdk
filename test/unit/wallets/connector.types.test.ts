/**
 * The seam with `@fairmint/canton-privy-sdk`, which does not depend on node-sdk: it declares its own copies of the
 * shapes it hands over. These are verbatim copies of privy-sdk's declarations (wave-2 contract §3.1), and ts-jest
 * type-checks that they are assignable to node-sdk's. A change here needs a matching privy-sdk release.
 */
import { createWriteLatch, type StorageLike, type WalletOption } from '../../../src/wallets';

// ----- privy-sdk's declarations, verbatim -----

/** A CIP-0103 provider (EIP-1193 style). Assignable to `@fairmint/canton-node-sdk`'s `Cip103Provider`. */
interface CantonPrivyCip103Provider {
  request(args: { readonly method: string; readonly params?: unknown }): Promise<unknown>;
  on(event: string, listener: (...args: unknown[]) => void): CantonPrivyCip103Provider;
  removeListener(event: string, listener: (...args: unknown[]) => void): CantonPrivyCip103Provider;
  emit(event: string, ...args: unknown[]): boolean;
}

type CantonPrivyApprovalMode = 'prompt' | 'auto';

interface CantonPrivyUserSignedProvider extends CantonPrivyCip103Provider {
  setApproval(mode: CantonPrivyApprovalMode): void;
  getApproval(): { readonly requested: CantonPrivyApprovalMode; readonly effective: CantonPrivyApprovalMode };
}

/** Structurally node-sdk's `LiveWalletOption`. */
interface CantonPrivyWalletOption {
  readonly mode: 'live';
  readonly key: string;
  readonly kind: 'privy';
  readonly name: string;
  readonly icon?: string;
  availability(network: 'devnet' | 'mainnet'): { readonly available: true };
  readonly live: {
    subscribe(listener: () => void): () => void;
    getProvider(): CantonPrivyUserSignedProvider | null;
    getRetainKey(): string | null;
    restore(): void;
  };
}

interface CantonPrivyWriteLatch {
  run<T>(
    label: string,
    fn: (context: { readonly signal: AbortSignal }) => Promise<T>
  ): Promise<{ readonly status: string }>;
}

type StorageLikeCopy = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

// ----- the checks -----

describe('the privy-sdk seam', () => {
  it("accepts privy-sdk's live option as a WalletOption and node-sdk's latch as privy-sdk's", () => {
    const privyShaped: CantonPrivyWalletOption = {
      mode: 'live',
      key: 'privy',
      kind: 'privy',
      name: 'Privy',
      availability: () => ({ available: true }),
      live: {
        subscribe: () => () => undefined,
        getProvider: () => null,
        getRetainKey: () => null,
        restore: () => undefined,
      },
    };
    const option: WalletOption = privyShaped;
    const latch: { run: CantonPrivyWriteLatch['run'] } = createWriteLatch();
    const storage: StorageLike = {} as StorageLikeCopy;
    expect(option.mode).toBe('live');
    expect(typeof latch.run).toBe('function');
    expect(storage).toBeDefined();
  });
});
