import { DA_REGISTRY_TEMPLATES } from '../../../src/da-registry/templates';
import type {
  Cip103EventListener,
  Cip103PrepareExecuteParams,
  Cip103Provider,
  Cip103Request,
} from '../../../src/wallets/cip103';
import type { FetchLike } from '../../../src/wallets/da-utilities/client';
import type { JsonObject } from '../../../src/wallets/json';
import type { ActiveContract, DisclosedContract } from '../../../src/wallets/types';

export const HOLDER = 'holder::1220aa';
export const OTHER = 'other::1220dd';
export const REGISTRAR = 'registrar::1220bb';
export const OPERATOR = 'operator::1220cc';
export const INSTRUMENT = { admin: REGISTRAR, id: 'XMPL' } as const;
export const DEVNET = 'https://api.utilities.digitalasset-dev.com';
export const NOW = new Date('2026-11-13T12:00:00.000Z');

/** A package-id form template id, as the ledger reports it. */
export const pkgId = (hashOrName: string, qualified: string): string => `${hashOrName}:${qualified}`;

export interface FetchCall {
  url: string;
  method: string;
  headers: Record<string, string> | undefined;
  body: unknown;
  /** The signal the SDK passed (undefined when the call had none). */
  signal?: AbortSignal | undefined;
}

/** A fake `fetch`: `handler` answers each call with a status and a JSON body (or raw text). */
export function fakeFetch(
  handler: (call: FetchCall) => {
    status?: number;
    json?: unknown;
    text?: string;
  }
): { fetch: FetchLike; calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  const fetch: FetchLike = async (url, init) => {
    const call: FetchCall = {
      url,
      method: init.method,
      headers: init.headers,
      body: init.body === undefined ? undefined : JSON.parse(init.body),
      signal: init.signal,
    };
    calls.push(call);
    const answer = handler(call);
    const status = answer.status ?? 200;
    const text = answer.text ?? JSON.stringify(answer.json);
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => text,
    };
  };
  return { fetch, calls };
}

export const disclosed = (contractId: string, qualified: string): Required<DisclosedContract> => ({
  contractId,
  templateId: pkgId('1eddd268', qualified),
  createdEventBlob: `blob-${contractId}`,
  synchronizerId: 'global-domain::1220ee',
});

/** What DA returns for a disclosed contract, with the extra fields the Ledger API refuses. */
export const daDisclosed = (contractId: string, qualified: string): Record<string, unknown> => ({
  ...disclosed(contractId, qualified),
  createdAt: '2026-11-13T00:00:00Z',
  domainId: 'global-domain::1220ee',
  debugPayload: { a: 1 },
});

export const CONTEXT_VALUES: JsonObject = {
  'utility.digitalasset.com/instrument-configuration': {
    tag: 'AV_ContractId',
    value: '00config',
  },
};

/** A CIP-0103 `ProviderRpcError`-shaped error. */
export class RpcError extends Error {
  constructor(
    readonly code: number,
    message: string,
    readonly data?: unknown
  ) {
    super(message);
    this.name = 'ProviderRpcError';
  }
}

export type RecordingProvider = Cip103Provider & { readonly requests: Cip103Request[] };

/** A provider answering each method from `answers` (an answer may throw), recording every request; others are 4200. */
export function scriptedProvider(
  answers: Partial<Record<Cip103Request['method'], (params: unknown) => unknown>>
): RecordingProvider {
  const requests: Cip103Request[] = [];
  return {
    requests,
    on: () => undefined,
    removeListener: () => undefined,
    async request(args) {
      requests.push(args);
      const answer = answers[args.method];
      if (!answer) throw new RpcError(4200, `unsupported ${args.method}`);
      return answer('params' in args ? args.params : undefined);
    },
  };
}

/**
 * A provider whose primary account is `party` (default {@link HOLDER}) on `canton:devnet` (plus `account`'s fields) and
 * that answers `signMessage` with `signMessage` (4200 without it).
 */
export function accountProvider(
  options: {
    readonly party?: string;
    readonly account?: Record<string, unknown>;
    readonly signMessage?: (message: string) => unknown;
  } = {}
): RecordingProvider {
  const { signMessage } = options;
  return scriptedProvider({
    getPrimaryAccount: () => ({
      primary: true,
      partyId: options.party ?? HOLDER,
      status: 'allocated',
      publicKey: 'pk',
      namespace: '1220aa',
      networkId: 'canton:devnet',
      ...options.account,
    }),
    ...(signMessage !== undefined && {
      signMessage: (params) => signMessage((params as { message: string }).message),
    }),
  });
}

export const LEDGER_END = 4242;

/** A Ledger JSON API v2 `CreatedEvent` for an `ActiveContract`. */
function createdEvent(active: ActiveContract): Record<string, unknown> {
  return {
    offset: 7,
    nodeId: 0,
    contractId: active.contractId,
    templateId: active.templateId,
    contractKey: null,
    createArgument: active.createArgument,
    witnessParties: [HOLDER],
    signatories: active.signatories,
    observers: [],
    createdAt: '2026-11-13T00:00:00Z',
    packageName: active.packageName,
  };
}

/** The template ids a `/v2/state/active-contracts` body filters on (and the party it filters for). */
export function acsFilter(body: unknown): {
  party: string;
  templateIds: string[];
} {
  const byParty = (
    body as {
      eventFormat: {
        filtersByParty: Record<
          string,
          {
            cumulative: Array<{
              identifierFilter: { TemplateFilter: { value: { templateId: string } } };
            }>;
          }
        >;
      };
    }
  ).eventFormat.filtersByParty;
  const [party, partyFilters] = Object.entries(byParty)[0] ?? [];
  if (party === undefined || partyFilters === undefined || partyFilters.cumulative.length === 0) {
    throw new Error('no party filter');
  }
  const templateIds = partyFilters.cumulative.map(
    ({ identifierFilter }) => identifierFilter.TemplateFilter.value.templateId
  );
  return { party, templateIds };
}

/** The ledger entries of any of the templates (the union a cumulative filter asks for). */
function matching(contracts: Record<string, ActiveContract[]>, templateIds: readonly string[]): unknown[] {
  return templateIds.flatMap((templateId) => (contracts[templateId] ?? []).map((c) => acsEntry(createdEvent(c))));
}

export interface FakeProvider extends Cip103Provider {
  readonly requests: Cip103Request[];
  /** `prepareExecuteAndWait` params, in order. */
  readonly submissions: Cip103PrepareExecuteParams[];
  /** The template ids of each ACS read, in order. */
  readonly reads: string[][];
  /** The `ledgerApi` resources requested, in order (`GET /v2/state/ledger-end`, …). */
  readonly ledgerCalls: () => string[];
}

export interface FakeProviderOptions {
  party?: string;
  submitError?: unknown;
  /** Called before each `ledgerApi` request is answered: throw from it to fail the request. */
  beforeLedgerApi?: (resource: string, body: unknown) => void;
  /** Answers `signMessage`; without it the method is 4200. */
  signMessage?: (message: string) => unknown;
  /** Extra fields of the primary account. */
  account?: Record<string, unknown>;
}

/**
 * A fake CIP-0103 provider over an in-memory ledger: `getPrimaryAccount` answers `party`, `ledgerApi` serves the ledger
 * end and the unpaged ACS per template filter, and `prepareExecuteAndWait` records the params and answers an executed
 * transaction (or throws `submitError`).
 */
export function fakeProvider(
  contracts: Record<string, ActiveContract[]>,
  options: FakeProviderOptions = {}
): FakeProvider {
  const requests: Cip103Request[] = [];
  const submissions: Cip103PrepareExecuteParams[] = [];
  const reads: string[][] = [];
  const party = options.party ?? HOLDER;
  return {
    requests,
    submissions,
    reads,
    ledgerCalls: () =>
      requests.flatMap((r) =>
        r.method === 'ledgerApi' ? [`${r.params.requestMethod.toUpperCase()} ${r.params.resource}`] : []
      ),
    on: () => undefined,
    removeListener: () => undefined,
    async request(args) {
      requests.push(args);
      switch (args.method) {
        case 'connect':
        case 'isConnected':
          return { isConnected: true, isNetworkConnected: true };
        case 'disconnect':
          return null;
        case 'getPrimaryAccount':
          return {
            primary: true,
            partyId: party,
            status: 'allocated',
            hint: 'holder',
            publicKey: 'pk',
            namespace: '1220aa',
            networkId: 'canton:devnet',
            signingProviderId: 'loop',
            ...options.account,
          };
        case 'ledgerApi': {
          const { requestMethod, resource, body } = args.params;
          options.beforeLedgerApi?.(resource, body);
          if (requestMethod === 'get' && resource === '/v2/state/ledger-end') {
            return { offset: LEDGER_END };
          }
          if (requestMethod === 'post' && resource === '/v2/state/active-contracts') {
            const { templateIds } = acsFilter(body);
            reads.push(templateIds);
            return matching(contracts, templateIds);
          }
          throw new RpcError(4200, `ledgerApi ${resource} is not allowed`);
        }
        case 'prepareExecuteAndWait': {
          submissions.push(args.params);
          if (options.submitError !== undefined) throw options.submitError;
          return {
            tx: {
              status: 'executed',
              commandId: args.params.commandId,
              payload: { updateId: 'update-1', completionOffset: 4243 },
            },
          };
        }
        case 'signMessage': {
          if (options.signMessage === undefined) throw new RpcError(4200, 'signMessage is not supported');
          return options.signMessage(args.params.message);
        }
      }
    },
  };
}

/**
 * A provider shaped like Loop's `Cip103Provider` (`loop.getCip103Provider()`): a class with listeners, Loop's error
 * class and codes, its `ledgerApi` allowlist (anything else is 4200), the connected-party-only filter rule, and 4100
 * until `connect`. It delegates the ledger to {@link fakeProvider}.
 */
export class FakeLoopCip103Provider {
  private readonly listeners = new Map<string, Cip103EventListener[]>();
  private readonly ledger: FakeProvider;
  connected = false;

  constructor(contracts: Record<string, ActiveContract[]>, submitError?: RpcError) {
    this.ledger = fakeProvider(contracts, { submitError });
  }

  get submissions(): Cip103PrepareExecuteParams[] {
    return this.ledger.submissions;
  }

  async request(args: { method: string; params?: unknown[] | Record<string, unknown> }): Promise<unknown> {
    if (args.method === 'connect') {
      this.connected = true;
      this.emit('statusChanged', { connection: { isConnected: true } });
      return { isConnected: true, isNetworkConnected: true };
    }
    if (!this.connected) throw new RpcError(4100, 'No authorized account');
    if (args.method === 'ledgerApi') {
      const params = args.params as { resource: string; body?: unknown };
      const allowed = ['/v2/state/ledger-end', '/v2/state/active-contracts'].includes(params.resource);
      if (!allowed) {
        throw new RpcError(4200, `Unsupported ledgerApi ${params.resource}`);
      }
      if (params.body !== undefined) {
        const { party } = acsFilter(params.body);
        if (party !== HOLDER) {
          throw new RpcError(-32602, 'Only the connected party may be read');
        }
      }
    }
    if (args.method === 'getPrimaryAccount' || args.method === 'ledgerApi' || args.method === 'prepareExecuteAndWait') {
      return this.ledger.request(args as Cip103Request);
    }
    throw new RpcError(4200, `Unsupported method ${args.method}`);
  }

  on(event: string, listener: Cip103EventListener): this {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
    return this;
  }

  emit(event: string, ...args: unknown[]): boolean {
    const listeners = this.listeners.get(event) ?? [];
    listeners.forEach((listener) => listener(...args));
    return listeners.length > 0;
  }

  removeListener(event: string, listener: Cip103EventListener): this {
    this.listeners.set(
      event,
      (this.listeners.get(event) ?? []).filter((l) => l !== listener)
    );
    return this;
  }
}

/** The package name of the DA Registry template of a `Module:Entity`, as the ledger reports it with the contract. */
function daPackageName(qualified: string): string {
  const id = Object.values(DA_REGISTRY_TEMPLATES).find((t) => t.endsWith(`:${qualified}`));
  return id === undefined ? 'other-package-v0' : id.slice(1, id.indexOf(':'));
}

/**
 * An active contract; the registrar signs it unless `signatories` says otherwise. A DA Registry template gets its
 * package name, anything else `other-package-v0`.
 */
export function contract(
  contractId: string,
  qualified: string,
  createArgument: JsonObject | null,
  signatories: readonly string[] = [REGISTRAR]
): ActiveContract {
  return {
    contractId,
    templateId: pkgId('1eddd268', qualified),
    packageName: daPackageName(qualified),
    signatories,
    createArgument,
  };
}

export const HOLDING_T = 'Utility.Registry.Holding.V0.Holding:Holding';

/** A DA Registry `Holding` as the ledger reports it, signed by its registrar and owner unless `signatories` says not. */
export function daHolding(
  contractId: string,
  amount: string,
  options: {
    owner?: string;
    lock?: JsonObject | null;
    instrument?: { source: string; id: string };
    signatories?: readonly string[];
  } = {}
): ActiveContract {
  const owner = options.owner ?? HOLDER;
  const instrument = options.instrument ?? { source: REGISTRAR, id: 'XMPL' };
  return contract(
    contractId,
    HOLDING_T,
    {
      operator: OPERATOR,
      provider: REGISTRAR,
      registrar: instrument.source,
      owner,
      instrument: { ...instrument, scheme: 'RegistrarInternalScheme' },
      label: '',
      amount,
      lock: options.lock ?? null,
    },
    options.signatories ?? [instrument.source, owner]
  );
}

/** A Ledger JSON API v2 ACS entry. */
export function acsEntry(event: Record<string, unknown>): unknown {
  return {
    workflowId: '',
    contractEntry: {
      JsActiveContract: {
        createdEvent: event,
        synchronizerId: 'global-domain::1220ee',
        reassignmentCounter: 0,
      },
    },
  };
}
