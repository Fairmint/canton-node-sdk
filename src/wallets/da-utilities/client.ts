/**
 * Digital Asset's public Utilities API (no auth, CORS open): the choice contexts and factories the holder-side DA
 * Registry actions need, and the CIP-56 instrument metadata. Browser-safe: it uses an injectable `fetch` and sends only
 * `content-type: application/json`.
 *
 * Endpoints: DA's Utilities OpenAPI (`utility.yaml` v2.2.0), and the token standard transfer-instruction V1 and
 * metadata V1 specs under `/api/token-standard/v0/registrars/{admin}`.
 */
import { awaitWithAbort, throwIfAborted } from '../abort';
import { RegistryApiError, RegistryResponseError } from '../errors';
import type { InstrumentMetadata } from '../holdings';
import { instrumentKey } from '../holdings';
import { isJsonObject, isRecord, nonEmptyString, type JsonObject } from '../json';
import { DA_REGISTRY_TEMPLATES } from '../../da-registry/templates';
import { qualifiedName, requireQualifiedName } from '../templates';
import type { TransferInstructionAction, TransferSpec } from '../commands';
import type { DisclosedContract, InstrumentId } from '../types';

export type DaNetwork = 'devnet' | 'mainnet';

/** DA Utilities API base URL per network. */
export const DA_UTILITIES_BASE_URLS: Readonly<Record<DaNetwork, string>> = {
  devnet: 'https://api.utilities.digitalasset-dev.com',
  mainnet: 'https://api.utilities.digitalasset.com',
};

/**
 * The subset of `fetch` this module uses; the global `fetch` satisfies it. `signal` is set when the caller passed one:
 * forward it so an aborted call stops its request (an implementation that ignores it still works; the SDK then stops
 * waiting for the answer instead).
 */
export type FetchLike = (
  url: string,
  init: {
    method: 'GET' | 'POST';
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  }
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

/** How a wallet reaches DA's Utilities API. */
export interface DaRegistryOptions {
  /**
   * Defaults to DA's own URL for the wallet's network (`https://api.utilities.digitalasset-dev.com` on DevNet,
   * `https://api.utilities.digitalasset.com` on MainNet); for example a proxy.
   */
  readonly baseUrl?: string;
  /** Defaults to `globalThis.fetch`. */
  readonly fetch?: FetchLike;
  /**
   * The registry providers to trust, per instrument admin (registrar party id → provider party ids). DA's registry lets
   * a registrar be served by another party's provider service; its mint offers, transfer offers and burn requests are
   * signed by that provider. An admin listed here trusts exactly the providers listed (include the admin itself if it
   * is also its own provider); an admin not listed trusts only itself. Offers and requests of any other provider are
   * never listed or acted on.
   */
  readonly trustedProviders?: Readonly<Record<string, readonly string[]>>;
}

/** Splice `ChoiceContext` data: passed through unchanged as `extraArgs.context`. */
export interface ChoiceContextData {
  readonly values: JsonObject;
}

/** What the registry returns for a choice: its context, and the contracts to disclose with the submission. */
export interface ChoiceContext {
  readonly choiceContextData: ChoiceContextData;
  readonly disclosedContracts: readonly DisclosedContract[];
}

/** A factory to exercise, with its choice context. */
export interface FactoryWithChoiceContext extends ChoiceContext {
  readonly factoryId: string;
}

/**
 * How the registry will run a transfer:
 *
 * - `offer`: a pending transfer the receiver must accept before it expires. The sender's tokens stay locked until the
 *   offer is accepted, rejected by the receiver or withdrawn by the sender; expiry alone only stops acceptance and does
 *   not unlock them (withdraw an expired offer to get them back);
 * - `direct`: the receiver pre-approved transfers, so the holdings move at once;
 * - `self`: sender and receiver are the same party (the holdings are merged or split).
 */
export type TransferKind = 'offer' | 'direct' | 'self';

export interface TransferFactory extends FactoryWithChoiceContext {
  readonly transferKind: TransferKind;
}

export interface BurnRequestContextArgs {
  readonly holder: string;
  /** The holder's unlocked holdings to burn from; DA refuses an empty list. */
  readonly holdingContractIds: readonly string[];
  readonly instrumentId: InstrumentId;
}

/**
 * DA's Utilities API for one network. An offer or request counts as DA's when a provider trusted for its instrument
 * admin signed it and it names DA's operator.
 */
export interface DaUtilitiesClient {
  /** The providers trusted for an instrument admin: the `trustedProviders` entry, else the admin itself. */
  readonly trustedProvidersOf: (instrumentAdmin: string) => readonly string[];
  /**
   * DA's operator party (`GET /api/utilities/v0/operator`), fetched once; a failed lookup is retried next call. The
   * lookup is shared, so `signal` only stops this call waiting for it.
   */
  operatorParty(signal?: AbortSignal): Promise<string>;
  /** The transfer factory for a transfer, and how DA will run it. */
  transferFactory(expectedAdmin: string, transfer: TransferSpec, signal?: AbortSignal): Promise<TransferFactory>;
  /** Context to accept, reject or withdraw a pending transfer. */
  transferInstructionContext(
    registrar: string,
    instructionCid: string,
    action: TransferInstructionAction,
    signal?: AbortSignal
  ): Promise<ChoiceContext>;
  /** Context to exercise `MintOffer_Accept` on the offer. */
  mintOfferAcceptContext(mintOfferCid: string, signal?: AbortSignal): Promise<ChoiceContext>;
  /** The allocation factory and context to exercise `AllocationFactory_RequestBurn`. */
  burnRequestContext(args: BurnRequestContextArgs, signal?: AbortSignal): Promise<FactoryWithChoiceContext>;
  /**
   * The instrument's CIP-56 metadata, or undefined on any failure (an error status, a malformed answer). An answer is
   * kept for the client's lifetime; a failure is asked again next call. The lookup is shared, so `signal` only stops
   * this call waiting for it: an aborted call throws an `AbortError`.
   */
  instrumentMetadata(instrumentId: InstrumentId, signal?: AbortSignal): Promise<InstrumentMetadata | undefined>;
}

const templateNames = (keys: ReadonlyArray<keyof typeof DA_REGISTRY_TEMPLATES>): readonly string[] =>
  keys.map((key) => requireQualifiedName(DA_REGISTRY_TEMPLATES[key]));

/**
 * `Module:Entity` of the templates DA names as the transfer factory, per kind: a direct transfer runs through the
 * receiver's `TransferPreapproval`, an offer or a self-transfer never does.
 */
export const DA_TRANSFER_FACTORY_TEMPLATES: Readonly<Record<TransferKind, readonly string[]>> = {
  direct: templateNames(['transferPreapproval']),
  offer: templateNames(['transferRule', 'allocationFactory']),
  self: templateNames(['transferRule', 'allocationFactory']),
};

/** `Module:Entity` of the template DA names as the burn (`AllocationFactory_RequestBurn`) factory. */
export const DA_BURN_FACTORY_TEMPLATES: readonly string[] = templateNames(['allocationFactory']);

/**
 * Null when `factoryId` is one of the disclosed contracts and its template is expected; otherwise why not. A registry
 * that names any other contract is refused before anything is signed.
 */
export function factoryTemplateError(
  factory: FactoryWithChoiceContext,
  expectedTemplates: readonly string[]
): string | null {
  const disclosed = factory.disclosedContracts.find((contract) => contract.contractId === factory.factoryId);
  if (!disclosed) {
    return 'The registry named a factory it did not disclose.';
  }
  const name = qualifiedName(disclosed.templateId);
  return name !== null && expectedTemplates.includes(name)
    ? null
    : `The registry named a factory of an unexpected template (${disclosed.templateId}).`;
}

/**
 * A DA disclosed contract stripped to the fields the Ledger API accepts: DA adds `createdAt`, `domainId` and debug
 * fields, which the ledger refuses.
 */
export function parseDisclosedContract(raw: unknown): DisclosedContract {
  if (!isRecord(raw)) {
    throw new RegistryResponseError('Registry returned a disclosed contract that is not an object');
  }
  const contractId = nonEmptyString(raw['contractId']);
  const templateId = nonEmptyString(raw['templateId']);
  const createdEventBlob = nonEmptyString(raw['createdEventBlob']);
  if (contractId === undefined || templateId === undefined || createdEventBlob === undefined) {
    throw new RegistryResponseError(
      'Registry returned a disclosed contract without contractId, templateId or createdEventBlob'
    );
  }
  const synchronizerId = nonEmptyString(raw['synchronizerId']);
  return {
    contractId,
    templateId,
    createdEventBlob,
    ...(synchronizerId !== undefined && { synchronizerId }),
  };
}

/** A `ChoiceContext` response: `choiceContextData` and `disclosedContracts` are both required. */
export function parseChoiceContext(raw: unknown): ChoiceContext {
  if (!isRecord(raw) || !isRecord(raw['choiceContextData'])) {
    throw new RegistryResponseError('Registry returned a choice context without choiceContextData');
  }
  const values = raw['choiceContextData']['values'] ?? {};
  if (!isJsonObject(values)) {
    throw new RegistryResponseError('Registry returned choice context values that are not a JSON object');
  }
  const disclosed = raw['disclosedContracts'];
  if (!Array.isArray(disclosed)) {
    throw new RegistryResponseError('Registry returned a choice context without a disclosedContracts list');
  }
  return {
    choiceContextData: { values },
    disclosedContracts: disclosed.map(parseDisclosedContract),
  };
}

function parseFactoryWithChoiceContext(raw: unknown): FactoryWithChoiceContext {
  const factoryId = isRecord(raw) ? nonEmptyString(raw['factoryId']) : undefined;
  if (!isRecord(raw) || factoryId === undefined) {
    throw new RegistryResponseError('Registry returned no factoryId');
  }
  return { factoryId, ...parseChoiceContext(raw['choiceContext']) };
}

function parseTransferFactory(raw: unknown): TransferFactory {
  const factory = parseFactoryWithChoiceContext(raw);
  const transferKind = isRecord(raw) ? raw['transferKind'] : undefined;
  if (transferKind !== 'offer' && transferKind !== 'direct' && transferKind !== 'self') {
    throw new RegistryResponseError(
      `Registry returned transferKind ${transferKind === undefined ? 'undefined' : JSON.stringify(transferKind)}`
    );
  }
  return { ...factory, transferKind };
}

/** The global `fetch`, looked up at call time; without one it throws, naming the `option` to pass instead. */
export function globalFetch(option: string): FetchLike {
  return async (url, init) => {
    const { fetch } = globalThis;
    if (typeof fetch !== 'function') throw new TypeError(`No global fetch: pass ${option}`);
    return fetch(url, init);
  };
}

/** CIP-56 `Instrument` metadata of `id`, or undefined when the answer is of another instrument or malformed. */
function parseInstrumentMetadata(raw: unknown, id: string): InstrumentMetadata | undefined {
  if (!isRecord(raw) || raw['id'] !== id) return undefined;
  const { name, symbol } = raw;
  // The spec's default when the registry leaves it out.
  const decimals = raw['decimals'] ?? 10;
  if (typeof name !== 'string' || typeof symbol !== 'string') return undefined;
  if (typeof decimals !== 'number' || !Number.isInteger(decimals) || decimals < 0 || decimals > 10) return undefined;
  return { name, symbol, decimals };
}

/** A client for DA's Utilities API on a network (at `options.baseUrl` when given). */
export function createDaUtilitiesClient(network: DaNetwork, options: DaRegistryOptions = {}): DaUtilitiesClient {
  const baseUrl = trimTrailingSlashes(options.baseUrl ?? DA_UTILITIES_BASE_URLS[network]);
  const fetchFn = options.fetch ?? globalFetch('registry.fetch');
  const trustedProvidersOf = trustedProvidersResolver(options.trustedProviders);

  /** One request; an aborted `signal` rejects it with an `AbortError`, also when `fetch` ignores the signal. */
  async function call(method: 'GET' | 'POST', path: string, body?: object, signal?: AbortSignal): Promise<unknown> {
    const url = `${baseUrl}${path}`;
    const { response, text } = await awaitWithAbort(async () => {
      const answer = await fetchFn(url, {
        method,
        ...(body !== undefined && {
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }),
        ...(signal !== undefined && { signal }),
      });
      return { response: answer, text: await answer.text() };
    }, signal);
    if (!response.ok) throw new RegistryApiError(response.status, text, url);
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new RegistryResponseError(`Registry returned non-JSON for ${url}`);
    }
  }

  const registryPath = (registrar: string): string =>
    `/api/token-standard/v0/registrars/${encodeURIComponent(registrar)}/registry`;

  async function fetchOperator(): Promise<string> {
    const raw = await call('GET', '/api/utilities/v0/operator');
    const partyId = isRecord(raw) ? nonEmptyString(raw['partyId']) : undefined;
    if (partyId === undefined) {
      throw new RegistryResponseError('Registry returned no operator partyId');
    }
    return partyId;
  }

  let operatorPromise: Promise<string> | undefined;
  async function operatorParty(signal?: AbortSignal): Promise<string> {
    throwIfAborted(signal);
    operatorPromise ??= fetchOperator().catch((error: unknown) => {
      operatorPromise = undefined;
      throw error;
    });
    const shared = operatorPromise;
    // A cancelled caller may never observe `shared`; other callers still do, so a later failure is never unhandled.
    void shared.catch(() => undefined);
    return signal === undefined ? shared : awaitWithAbort(async () => shared, signal);
  }

  const metadata = new Map<string, Promise<InstrumentMetadata | undefined>>();
  /** A lookup still unanswered after this long gives undefined (and is retried next time), so a load never hangs on it. */
  const METADATA_TIMEOUT_MS = 5000;
  async function instrumentMetadata(
    instrumentId: InstrumentId,
    signal?: AbortSignal
  ): Promise<InstrumentMetadata | undefined> {
    throwIfAborted(signal);
    const key = instrumentKey(instrumentId);
    let pending = metadata.get(key);
    if (pending === undefined) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timedOut = new Promise<undefined>((resolve) => {
        timer = setTimeout(() => resolve(undefined), METADATA_TIMEOUT_MS);
      });
      const lookup = call(
        'GET',
        `${registryPath(instrumentId.admin)}/metadata/v1/instruments/${encodeURIComponent(instrumentId.id)}`
      ).then(
        (raw) => parseInstrumentMetadata(raw, instrumentId.id),
        () => undefined
      );
      pending = Promise.race([lookup, timedOut]).finally(() => clearTimeout(timer));
      metadata.set(key, pending);
    }
    const shared = pending;
    void shared.catch(() => undefined);
    const answer = signal === undefined ? await shared : await awaitWithAbort(async () => shared, signal);
    if (answer === undefined && metadata.get(key) === pending) metadata.delete(key);
    return answer;
  }

  return {
    trustedProvidersOf,
    operatorParty,
    instrumentMetadata,

    async mintOfferAcceptContext(mintOfferCid, signal) {
      return parseChoiceContext(
        await call(
          'POST',
          `/api/utilities/v0/registry/mint/v0/offer/${encodeURIComponent(mintOfferCid)}/choice-contexts/accept`,
          {},
          signal
        )
      );
    },

    async burnRequestContext({ holder, holdingContractIds, instrumentId }, signal) {
      return parseFactoryWithChoiceContext(
        await call(
          'POST',
          '/api/utilities/v0/registry/burn/v0/request',
          {
            holder,
            holdingContractIds: [...holdingContractIds],
            instrumentId: { admin: instrumentId.admin, id: instrumentId.id },
          },
          signal
        )
      );
    },

    async transferFactory(expectedAdmin, transfer, signal) {
      return parseTransferFactory(
        await call(
          'POST',
          `${registryPath(expectedAdmin)}/transfer-instruction/v1/transfer-factory`,
          {
            choiceArguments: {
              expectedAdmin,
              transfer: {
                sender: transfer.sender,
                receiver: transfer.receiver,
                amount: transfer.amount,
                instrumentId: {
                  admin: transfer.instrumentId.admin,
                  id: transfer.instrumentId.id,
                },
                requestedAt: transfer.requestedAt,
                executeBefore: transfer.executeBefore,
                inputHoldingCids: [...transfer.inputHoldingCids],
                meta: { values: { ...transfer.meta.values } },
              },
              extraArgs: {
                context: { values: {} },
                meta: { values: {} },
              },
            },
            excludeDebugFields: true,
          },
          signal
        )
      );
    },

    async transferInstructionContext(registrar, instructionCid, action, signal) {
      return parseChoiceContext(
        await call(
          'POST',
          `${registryPath(registrar)}/transfer-instruction/v1/${encodeURIComponent(instructionCid)}/choice-contexts/${action}`,
          { excludeDebugFields: true },
          signal
        )
      );
    },
  };
}

/** A non-empty list of non-empty strings (checked at run time: JavaScript callers can pass anything). */
function isPartyList(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((party: unknown) => typeof party === 'string' && party.length > 0)
  );
}

/**
 * Validate `trustedProviders` once and resolve it per instrument admin. Only own properties count, so an admin named
 * like an `Object.prototype` member (`constructor`, `__proto__`) never inherits anything.
 */
function trustedProvidersResolver(
  configured: Readonly<Record<string, readonly string[]>> | undefined
): (instrumentAdmin: string) => readonly string[] {
  const byAdmin = new Map<string, readonly string[]>();
  for (const [admin, providers] of Object.entries(configured ?? {})) {
    if (admin.length === 0 || !isPartyList(providers)) {
      throw new TypeError(`trustedProviders[${JSON.stringify(admin)}] must be a non-empty list of party ids`);
    }
    byAdmin.set(admin, Object.freeze([...providers]));
  }
  return (instrumentAdmin) => byAdmin.get(instrumentAdmin) ?? [instrumentAdmin];
}

/** Drop trailing `/` characters in linear time (a `/\/+$/` regex backtracks quadratically). */
function trimTrailingSlashes(url: string): string {
  let end = url.length;
  while (end > 0 && url[end - 1] === '/') end--;
  return url.slice(0, end);
}
