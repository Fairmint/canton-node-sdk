/**
 * Digital Asset's off-ledger Registry API (`https://api.utilities.digitalasset[-staging|-dev].com`).
 *
 * The registry's transfer rule, factories, credentials and receivers' preapprovals are not visible to every submitter,
 * so a transaction first fetches them here as a choice context plus disclosed contracts.
 *
 * The API is public and unauthenticated, so this client does not use the SDK's runtime configuration; pass the base URL
 * for the network (and optionally a pre-configured axios instance for tests or custom transports).
 */
import axios, { type AxiosInstance } from 'axios';
import { ApiError, ValidationError } from '../core/errors';
import { isRecord } from '../core/utils';
import { type DisclosedContract } from '../utils/ledger';
import { type TokenStandardV1Transfer } from '../utils/token-standard';

export interface DaRegistryChoiceContext {
  choiceContextData: { values: Record<string, unknown> };
  disclosedContracts: DisclosedContract[];
}

export interface DaRegistryFactoryWithContext {
  factoryId: string;
  choiceContext: DaRegistryChoiceContext;
}

/** `direct`: the receiver's preapproval lands the transfer in one step. `offer`: a two-step instruction. */
export type DaRegistryTransferKind = 'direct' | 'offer' | 'self';

export interface DaRegistryTransferFactoryWithContext extends DaRegistryFactoryWithContext {
  transferKind: DaRegistryTransferKind;
}

export interface DaRegistryInstrumentId {
  admin: string;
  id: string;
}

export interface DaRegistryApi {
  operatorParty: () => Promise<string>;
  /** `null` when DA does not know the registrar (404). */
  registryInfo: (registrar: string) => Promise<Record<string, unknown> | null>;
  /** `null` when DA does not know the instrument (404). */
  instrumentMetadata: (registrar: string, instrumentId: string) => Promise<Record<string, unknown> | null>;
  /** `null` while DA has not indexed the registrar's factory or the instrument (404). */
  mintOfferFactory: (
    holder: string,
    instrumentId: DaRegistryInstrumentId
  ) => Promise<DaRegistryFactoryWithContext | null>;
  /** The factory a sender exercises `TransferFactory_Transfer` on, and its context. Read only. */
  transferFactory: (admin: string, transfer: TokenStandardV1Transfer) => Promise<DaRegistryTransferFactoryWithContext>;
}

const TIMEOUT_MS = 30_000;

/** The ledger rejects disclosed contracts with extra fields, and DA's responses carry debug fields. */
export function parseDaRegistryDisclosedContract(raw: unknown): DisclosedContract {
  const c = raw as Record<string, unknown>;
  const fields = ['templateId', 'contractId', 'createdEventBlob', 'synchronizerId'] as const;
  for (const field of fields) {
    if (typeof c[field] !== 'string' || c[field] === '') {
      throw new ValidationError(`DA API returned a disclosed contract without ${field}`);
    }
  }
  return {
    templateId: c['templateId'] as string,
    contractId: c['contractId'] as string,
    createdEventBlob: c['createdEventBlob'] as string,
    synchronizerId: c['synchronizerId'] as string,
  };
}

export function parseDaRegistryChoiceContext(raw: unknown): DaRegistryChoiceContext {
  const c = (raw ?? {}) as { choiceContextData?: { values?: unknown }; disclosedContracts?: unknown };
  const values = c.choiceContextData?.values;
  if (values !== undefined && !isRecord(values)) {
    throw new ValidationError('DA API returned a choice context whose values are not a record');
  }
  if (c.disclosedContracts !== undefined && !Array.isArray(c.disclosedContracts)) {
    throw new ValidationError('DA API returned disclosed contracts that are not a list');
  }
  return {
    choiceContextData: { values: values ?? {} },
    disclosedContracts: (c.disclosedContracts ?? []).map(parseDaRegistryDisclosedContract),
  };
}

function toFactoryWithContext(raw: unknown, what: string): DaRegistryFactoryWithContext {
  const r = (raw ?? {}) as { factoryId?: unknown; choiceContext?: unknown };
  if (typeof r.factoryId !== 'string') throw new ValidationError(`DA API ${what} response has no factoryId`);
  return { factoryId: r.factoryId, choiceContext: parseDaRegistryChoiceContext(r.choiceContext) };
}

export function createDaRegistryApi(
  baseUrl: string,
  http: AxiosInstance = axios.create({ timeout: TIMEOUT_MS })
): DaRegistryApi {
  const tokenStandard = (registrar: string): string =>
    `${baseUrl}/api/token-standard/v0/registrars/${encodeURIComponent(registrar)}`;

  async function getOrNull(url: string): Promise<Record<string, unknown> | null> {
    try {
      const { data } = await http.get<Record<string, unknown>>(url);
      // A successful body must be a record; a `null` body would masquerade as the 404 sentinel below.
      if (!isRecord(data)) throw new ValidationError(`DA API GET ${url} returned a malformed body`);
      return data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) return null;
      throw describe(error, `GET ${url}`);
    }
  }

  async function post(url: string, body: unknown): Promise<unknown> {
    try {
      const { data } = await http.post<unknown>(url, body);
      // A successful body must be a record; anything else would fail later with a raw TypeError.
      if (!isRecord(data)) throw new ValidationError(`DA API POST ${url} returned a malformed body`);
      return data;
    } catch (error) {
      throw describe(error, `POST ${url}`);
    }
  }

  async function postOrNull(url: string, body: unknown): Promise<unknown> {
    try {
      const { data } = await http.post<unknown>(url, body);
      // A successful body must be a record; a `null` body would masquerade as the 404 sentinel below.
      if (!isRecord(data)) throw new ValidationError(`DA API POST ${url} returned a malformed body`);
      return data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) return null;
      throw describe(error, `POST ${url}`);
    }
  }

  return {
    async operatorParty() {
      const data = await getOrNull(`${baseUrl}/api/utilities/v0/operator`);
      const partyId = data?.['partyId'];
      if (typeof partyId !== 'string') throw new ValidationError('DA API did not return its operator party');
      return partyId;
    },
    registryInfo: async (registrar) => getOrNull(`${tokenStandard(registrar)}/registry/metadata/v1/info`),
    instrumentMetadata: async (registrar, instrumentId) =>
      getOrNull(`${tokenStandard(registrar)}/registry/metadata/v1/instruments/${encodeURIComponent(instrumentId)}`),
    async mintOfferFactory(holder, instrumentId) {
      const raw = await postOrNull(`${baseUrl}/api/utilities/v0/registry/mint/v0/offer`, { holder, instrumentId });
      return raw === null ? null : toFactoryWithContext(raw, 'mint offer');
    },
    async transferFactory(admin, transfer) {
      const raw = await post(`${tokenStandard(admin)}/registry/transfer-instruction/v1/transfer-factory`, {
        choiceArguments: {
          expectedAdmin: admin,
          // The V1 choice argument requires `meta`; the public transfer input lets callers omit it.
          transfer: { ...transfer, meta: transfer.meta ?? { values: {} } },
          extraArgs: { context: { values: {} }, meta: { values: {} } },
        },
        excludeDebugFields: true,
      });
      const { transferKind } = raw as { transferKind?: unknown };
      if (transferKind !== 'direct' && transferKind !== 'offer' && transferKind !== 'self') {
        throw new ValidationError(`DA API transfer factory returned transferKind ${String(transferKind)}`);
      }
      return { ...toFactoryWithContext(raw, 'transfer factory'), transferKind };
    },
  };
}

function describe(error: unknown, request: string): Error {
  if (axios.isAxiosError(error)) {
    const body = error.response?.data === undefined ? '' : ` ${JSON.stringify(error.response.data)}`;
    const status = error.response?.status;
    return new ApiError(
      `${request} failed: ${status ?? error.code ?? 'no response'}${body}`,
      status,
      error.response?.statusText,
      error.response?.data as Record<string, unknown> | undefined
    );
  }
  return error instanceof Error ? error : new Error(String(error));
}
