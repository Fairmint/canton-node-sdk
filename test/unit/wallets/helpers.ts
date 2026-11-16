import type {
  ActiveContract,
  Cip103EventListener,
  Cip103PrepareExecuteParams,
  Cip103Provider,
  Cip103Request,
  ContractFilter,
  DisclosedContract,
  FetchLike,
  JsonObject,
} from '../../../src/wallets';

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
    message: string
  ) {
    super(message);
    this.name = 'ProviderRpcError';
  }
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
    createdEventBlob: '',
    interfaceViews: active.interfaceViews.map((view) => ({
      interfaceId: view.interfaceId,
      viewStatus: { code: 0, message: '', details: [] },
      viewValue: view.viewValue,
    })),
    witnessParties: [HOLDER],
    signatories: active.signatories,
    observers: [],
    createdAt: '2026-11-13T00:00:00Z',
    ...(active.packageName !== undefined && {
      packageName: active.packageName,
    }),
  };
}

/** The template and interface ids a `/v2/state/active-contracts(-page)` body filters on (and the party it filters for). */
export function acsFilter(body: unknown): {
  party: string;
  filters: ContractFilter[];
} {
  const byParty = (
    body as {
      eventFormat: {
        filtersByParty: Record<
          string,
          {
            cumulative: Array<{
              identifierFilter: {
                TemplateFilter?: { value: { templateId: string } };
                InterfaceFilter?: { value: { interfaceId: string } };
              };
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
  const filters = partyFilters.cumulative.map(({ identifierFilter: identifier }): ContractFilter =>
    identifier.TemplateFilter
      ? { templateId: identifier.TemplateFilter.value.templateId }
      : { interfaceId: identifier.InterfaceFilter?.value.interfaceId ?? '' }
  );
  return { party, filters };
}

/** The ledger entries matching any of the filters (the union a cumulative filter asks for), each contract once. */
function matching(contracts: Record<string, ActiveContract[]>, filters: readonly ContractFilter[]): unknown[] {
  const seen = new Set<string>();
  return filters.flatMap((filter) =>
    (contracts['templateId' in filter ? filter.templateId : filter.interfaceId] ?? []).flatMap((c) => {
      if (seen.has(c.contractId)) return [];
      seen.add(c.contractId);
      return [acsEntry(createdEvent(c))];
    })
  );
}

export interface FakeProvider extends Cip103Provider {
  readonly requests: Cip103Request[];
  /** `prepareExecuteAndWait` params, in order. */
  readonly submissions: Cip103PrepareExecuteParams[];
  /** The filters of each ACS read (its first page, or its unpaged request), in order. */
  readonly reads: ContractFilter[][];
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
 * end and the ACS (paged and unpaged) per template/interface filter, and `prepareExecuteAndWait` records the params and
 * answers an executed transaction (or throws `submitError`).
 */
export function fakeProvider(
  contracts: Record<string, ActiveContract[]>,
  options: FakeProviderOptions = {}
): FakeProvider {
  const requests: Cip103Request[] = [];
  const submissions: Cip103PrepareExecuteParams[] = [];
  const reads: ContractFilter[][] = [];
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
            const { filters } = acsFilter(body);
            reads.push(filters);
            return matching(contracts, filters);
          }
          if (requestMethod === 'post' && resource === '/v2/state/active-contracts-page') {
            // Pages of `maxPageSize`; the page token is the index of the page's first entry.
            const { filters } = acsFilter(body);
            const { maxPageSize, pageToken } = body as { maxPageSize: number; pageToken?: string };
            if (pageToken === undefined) reads.push(filters);
            const all = matching(contracts, filters);
            const from = pageToken === undefined ? 0 : Number(pageToken);
            const to = from + maxPageSize;
            return {
              activeContracts: all.slice(from, to),
              activeAtOffset: LEDGER_END,
              ...(to < all.length && { nextPageToken: String(to) }),
            };
          }
          throw new RpcError(4200, `ledgerApi ${resource} is not allowed`);
        }
        case 'prepareExecuteAndWait': {
          submissions.push(args.params);
          if (options.submitError !== undefined) throw options.submitError;
          return {
            tx: {
              status: 'executed',
              commandId: args.params.commandId ?? 'wallet-cmd',
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
      const allowed = [
        '/v2/state/ledger-end',
        '/v2/state/active-contracts',
        '/v2/state/active-contracts-page',
      ].includes(params.resource);
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

/** An active contract; the registrar signs it unless `signatories` says otherwise. */
export function contract(
  contractId: string,
  qualified: string,
  createArgument: JsonObject | null,
  interfaceViews: ActiveContract['interfaceViews'] = [],
  signatories: readonly string[] = [REGISTRAR]
): ActiveContract {
  return {
    contractId,
    templateId: pkgId('1eddd268', qualified),
    signatories,
    createArgument,
    interfaceViews,
  };
}

export const HOLDING_INTERFACE_PKG =
  '718a0f77e505a8de22f188bd4c87fe74101274e9d4cb1bfac7d09aec7158d35b:Splice.Api.Token.HoldingV1:Holding';

/** A holding seen through its HoldingV1 view. */
export function holdingView(
  contractId: string,
  amount: string,
  options: {
    owner?: string;
    lock?: JsonObject | null;
    instrument?: JsonObject;
    signatories?: readonly string[];
  } = {}
): ActiveContract {
  const holding = contract(
    contractId,
    'Utility.Registry.Holding.V0.Holding:Holding',
    null,
    [
      {
        interfaceId: HOLDING_INTERFACE_PKG,
        viewValue: {
          owner: options.owner ?? HOLDER,
          instrumentId: options.instrument ?? { admin: REGISTRAR, id: 'XMPL' },
          amount,
          lock: options.lock ?? null,
          meta: { values: {} },
        },
      },
    ],
    options.signatories ?? [REGISTRAR, options.owner ?? HOLDER]
  );
  return { ...holding, packageName: 'utility-registry-holding-v0' };
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
