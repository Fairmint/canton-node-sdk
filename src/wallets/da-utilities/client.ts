/**
 * Digital Asset's public Utilities API (no auth, CORS open), for the choice contexts the holder-side DA Registry
 * actions need. Browser-safe: it uses an injectable `fetch` and sends only `content-type: application/json`.
 *
 * Endpoints: DA's Utilities OpenAPI (`utility.yaml` v2.2.0) and token-standard transfer-instruction V1 spec.
 */
import { isFromRegistry, parseTransferOffer } from '../contracts';
import { RegistryApiError, RegistryResponseError } from '../errors';
import { parseHolding } from '../holdings';
import { isJsonObject, isRecord, nonEmptyString } from '../json';
import { DA_REGISTRY_TEMPLATES } from '../../da-registry/templates';
import { packageNameOf, requireQualifiedName, sameQualifiedName } from '../templates';
import type {
  ChoiceContext,
  FactoryWithChoiceContext,
  TokenRegistry,
  TransferFactory,
  TransferFactoryArgs,
  TransferInstructionAction,
} from '../token-registry';
import type { ActiveContract, DisclosedContract, InstrumentId } from '../types';

export type DaNetwork = 'devnet' | 'mainnet';

/** DA Utilities API base URL per network. */
export const DA_UTILITIES_BASE_URLS: Readonly<Record<DaNetwork, string>> = {
  devnet: 'https://api.utilities.digitalasset-dev.com',
  mainnet: 'https://api.utilities.digitalasset.com',
};

/** The subset of `fetch` this module uses; the global `fetch` satisfies it. */
export type FetchLike = (
  url: string,
  init: {
    method: 'GET' | 'POST';
    headers?: Record<string, string>;
    body?: string;
  }
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

export type DaUtilitiesTarget = { network: DaNetwork } | { baseUrl: string };

export interface DaUtilitiesClientOptions {
  /** Defaults to `globalThis.fetch`. */
  fetch?: FetchLike;
  /**
   * The registry providers to trust, per instrument admin (registrar party id → provider party ids). DA's registry lets
   * a registrar be served by another party's provider service; its mint offers, transfer offers and burn requests are
   * signed by that provider. An admin listed here trusts exactly the providers listed (include the admin itself if it
   * is also its own provider); an admin not listed trusts only itself. Offers and requests of any other provider are
   * never listed or acted on.
   */
  trustedProviders?: Readonly<Record<string, readonly string[]>>;
}

export interface BurnRequestContextArgs {
  readonly holder: string;
  /** The holder's unlocked holdings to burn from; DA refuses an empty list. */
  readonly holdingContractIds: readonly string[];
  readonly instrumentId: InstrumentId;
}

/**
 * DA's Utilities API: the CIP-56 registry methods plus DA's own mint and burn endpoints. It serves DA Registry
 * `Holding`s only: a holding counts when its registrar signed it, and an offer or request when a provider trusted for
 * its instrument admin signed it and it names DA's operator.
 */
export interface DaUtilitiesClient extends TokenRegistry {
  readonly baseUrl: string;
  /** The providers trusted for an instrument admin: the `trustedProviders` entry, else the admin itself. */
  trustedProvidersOf(instrumentAdmin: string): readonly string[];
  /** DA's operator party (`GET /api/utilities/v0/operator`), fetched once; a failed lookup is retried next call. */
  operatorParty(): Promise<string>;
  /** Context to exercise `MintOffer_Accept` on the offer. */
  mintOfferAcceptContext(mintOfferCid: string): Promise<ChoiceContext>;
  /** The allocation factory and context to exercise `AllocationFactory_RequestBurn`. */
  burnRequestContext(args: BurnRequestContextArgs): Promise<FactoryWithChoiceContext>;
}

/** `Module:Entity` of the templates DA names as a transfer factory. */
export const DA_TRANSFER_FACTORY_TEMPLATES: readonly string[] = (
  ['transferRule', 'transferPreapproval', 'allocationFactory'] as const
).map((key) => requireQualifiedName(DA_REGISTRY_TEMPLATES[key]));

/** `Module:Entity` of the template DA names as the burn (`AllocationFactory_RequestBurn`) factory. */
export const DA_BURN_FACTORY_TEMPLATES: readonly string[] = [
  requireQualifiedName(DA_REGISTRY_TEMPLATES.allocationFactory),
];

const DA_HOLDING_PACKAGE_NAME = packageNameOf(DA_REGISTRY_TEMPLATES.holding);

/**
 * Whether a contract is a DA Registry `Holding` its instrument admin signed. The holding's signatories are its
 * registrar (the instrument admin), its owner and any lockers; DA's operator is only an observer. The template name and
 * interface view alone prove nothing: any party can create a look-alike from its own package, with the wallet party as
 * observer, so only the registrar's signature makes a holding real.
 */
export function isGenuineDaHolding(contract: ActiveContract): boolean {
  if (
    !sameQualifiedName(contract.templateId, DA_REGISTRY_TEMPLATES.holding) ||
    (contract.packageName !== undefined && contract.packageName !== DA_HOLDING_PACKAGE_NAME)
  ) {
    return false;
  }
  const holding = parseHolding(contract);
  return holding !== null && contract.signatories.includes(holding.instrumentId.admin);
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

/** The global `fetch`, looked up at call time. */
const globalFetch: FetchLike = async (url, init) => {
  const { fetch } = globalThis;
  if (typeof fetch !== 'function') {
    throw new TypeError('No global fetch: pass { fetch } to createDaUtilitiesClient');
  }
  return fetch(url, init);
};

/** A client for DA's Utilities API on a network (or any base URL, e.g. a proxy). */
export function createDaUtilitiesClient(
  target: DaUtilitiesTarget,
  options: DaUtilitiesClientOptions = {}
): DaUtilitiesClient {
  const baseUrl = trimTrailingSlashes('network' in target ? DA_UTILITIES_BASE_URLS[target.network] : target.baseUrl);
  const fetchFn = options.fetch ?? globalFetch;
  const trustedProvidersOf = trustedProvidersResolver(options.trustedProviders);

  async function call(method: 'GET' | 'POST', path: string, body?: object): Promise<unknown> {
    const url = `${baseUrl}${path}`;
    const response = await fetchFn(url, {
      method,
      ...(body !== undefined && {
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    });
    const text = await response.text();
    if (!response.ok) throw new RegistryApiError(response.status, text, url);
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new RegistryResponseError(`Registry returned non-JSON for ${url}`);
    }
  }

  const registrarPath = (registrar: string): string =>
    `/api/token-standard/v0/registrars/${encodeURIComponent(registrar)}/registry/transfer-instruction/v1`;

  async function fetchOperator(): Promise<string> {
    const raw = await call('GET', '/api/utilities/v0/operator');
    const partyId = isRecord(raw) ? nonEmptyString(raw['partyId']) : undefined;
    if (partyId === undefined) {
      throw new RegistryResponseError('Registry returned no operator partyId');
    }
    return partyId;
  }

  let operatorPromise: Promise<string> | undefined;
  async function operatorParty(): Promise<string> {
    operatorPromise ??= fetchOperator().catch((error: unknown) => {
      operatorPromise = undefined;
      throw error;
    });
    return operatorPromise;
  }

  return {
    baseUrl,
    expectedTransferFactoryTemplates: DA_TRANSFER_FACTORY_TEMPLATES,
    operatorParty,
    trustedProvidersOf,

    servesHolding: isGenuineDaHolding,

    async pendingTransfers(read) {
      const [contracts, operator] = await Promise.all([
        read({ templateId: DA_REGISTRY_TEMPLATES.transferOffer }),
        operatorParty(),
      ]);
      return contracts.flatMap((contract) => {
        const offer = parseTransferOffer(contract);
        return offer !== null &&
          isFromRegistry(offer, contract.signatories, operator, trustedProvidersOf(offer.instrumentId.admin))
          ? [offer]
          : [];
      });
    },

    async mintOfferAcceptContext(mintOfferCid) {
      return parseChoiceContext(
        await call(
          'POST',
          `/api/utilities/v0/registry/mint/v0/offer/${encodeURIComponent(mintOfferCid)}/choice-contexts/accept`,
          {}
        )
      );
    },

    async burnRequestContext({ holder, holdingContractIds, instrumentId }) {
      return parseFactoryWithChoiceContext(
        await call('POST', '/api/utilities/v0/registry/burn/v0/request', {
          holder,
          holdingContractIds: [...holdingContractIds],
          instrumentId: { admin: instrumentId.admin, id: instrumentId.id },
        })
      );
    },

    async transferFactory({ expectedAdmin, transfer }: TransferFactoryArgs) {
      return parseTransferFactory(
        await call('POST', `${registrarPath(expectedAdmin)}/transfer-factory`, {
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
        })
      );
    },

    async transferInstructionContext(registrar: string, instructionCid: string, action: TransferInstructionAction) {
      return parseChoiceContext(
        await call(
          'POST',
          `${registrarPath(registrar)}/${encodeURIComponent(instructionCid)}/choice-contexts/${action}`,
          { excludeDebugFields: true }
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
