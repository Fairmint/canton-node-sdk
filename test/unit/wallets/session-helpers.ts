/** Test doubles for the wallet session and store tests: a scriptable CIP-0103 provider, deferred replies, a flush. */
import type {
  Cip103EventListener,
  Cip103Provider,
  Cip103Request,
  Cip103Session,
  ConnectedWallet,
} from '../../../src/wallets';
import { HOLDER, RpcError } from './helpers';

/** A promise and its settle functions. */
export function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (error: unknown) => void } {
  let resolve: (value: T) => void = () => undefined;
  let reject: (error: unknown) => void = () => undefined;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Let every reply that is already answered settle: a few macrotask turns, no timers. */
export async function flush(): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });
  }
}

type Answer = (request: Cip103Request) => unknown;

/**
 * A CIP-0103 provider whose answers the test sets per method (`answers`), with real listeners: `emit` calls them and
 * `listenerCount` counts them. A method without an answer is 4200. An answer may return a promise to hold the reply.
 */
export class TestProvider implements Cip103Provider {
  readonly requests: string[] = [];
  readonly answers: Partial<Record<Cip103Request['method'], Answer>>;
  private readonly listeners = new Map<string, Cip103EventListener[]>();

  constructor(party: string = HOLDER, answers: Partial<Record<Cip103Request['method'], Answer>> = {}) {
    this.answers = {
      connect: () => ({ isConnected: true, isNetworkConnected: true }),
      disconnect: () => null,
      isConnected: () => ({ isConnected: true, isNetworkConnected: true }),
      getPrimaryAccount: () => ({ primary: true, partyId: party }),
      ...answers,
    };
  }

  /** Answer `getPrimaryAccount` with `party` from now on. */
  setParty(party: string): void {
    this.answers.getPrimaryAccount = () => ({ primary: true, partyId: party });
  }

  async request(args: Cip103Request): Promise<unknown> {
    this.requests.push(args.method);
    const answer = this.answers[args.method];
    if (answer === undefined) throw new RpcError(4200, `${args.method} is not supported`);
    return answer(args);
  }

  on(event: string, listener: Cip103EventListener): this {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
    return this;
  }

  removeListener(event: string, listener: Cip103EventListener): this {
    this.listeners.set(
      event,
      (this.listeners.get(event) ?? []).filter((l) => l !== listener)
    );
    return this;
  }

  emit(event: string, ...args: unknown[]): void {
    for (const listener of this.listeners.get(event) ?? []) listener(...args);
  }

  listenerCount(): number {
    return [...this.listeners.values()].reduce((sum, list) => sum + list.length, 0);
  }
}

/** The connected wallet, failing the test when the session is not connected. */
export function connectedWallet(session: Cip103Session): ConnectedWallet {
  const state = session.getSnapshot();
  if (state.status !== 'connected') throw new Error(`not connected: ${JSON.stringify(state)}`);
  return state.wallet;
}
