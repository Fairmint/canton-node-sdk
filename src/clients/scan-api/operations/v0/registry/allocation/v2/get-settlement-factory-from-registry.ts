import { z } from 'zod';
import { createApiOperation } from '../../../../../../../core';
import { RecordSchema } from '../../../../../../ledger-json-api/schemas/base';

const endpoint = '/registry/allocation/v2/settlement-factory';
const TRAILING_SLASHES_PATTERN = /\/+$/;
const publicRequestConfig = {
  contentType: 'application/json',
  includeBearerToken: false,
} as const;

const RegistryUrlSchema = z.url().refine((value) => {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}, 'registryUrl must use http or https');

export const GetSettlementFactoryFromRegistryParamsSchema = z.object({
  /** Base URL advertised for the instrument admin's Token Standard registry. */
  registryUrl: RegistryUrlSchema,
  /** Complete SettlementFactory_SettleBatch choice argument with empty context and metadata. */
  choiceArguments: RecordSchema,
  excludeDebugFields: z.boolean().optional(),
});

export type GetSettlementFactoryFromRegistryParams = z.infer<typeof GetSettlementFactoryFromRegistryParamsSchema>;

/** Request body from the CIP-112 allocation V2 registry API. */
export interface GetSettlementFactoryFromRegistryRequest {
  readonly choiceArguments: Readonly<Record<string, unknown>>;
  readonly excludeDebugFields: boolean;
}

/** Required disclosed-contract fields from the CIP-112 allocation V2 registry API. */
export interface GetSettlementFactoryFromRegistryDisclosedContract {
  readonly templateId: string;
  readonly contractId: string;
  readonly createdEventBlob: string;
  readonly synchronizerId: string;
}

/** ChoiceContext record returned by the CIP-112 allocation V2 registry API. */
export interface GetSettlementFactoryFromRegistryChoiceContextData {
  readonly values: Readonly<Record<string, unknown>>;
}

/** Response from the CIP-112 allocation V2 settlement-factory registry API. */
export interface GetSettlementFactoryFromRegistryResponse {
  readonly factoryId: string;
  readonly choiceContext: {
    readonly choiceContextData: GetSettlementFactoryFromRegistryChoiceContextData;
    readonly disclosedContracts: readonly GetSettlementFactoryFromRegistryDisclosedContract[];
  };
}

function buildRegistryEndpoint(registryUrl: string): string {
  const url = new URL(registryUrl);
  url.username = '';
  url.password = '';
  url.search = '';
  url.hash = '';
  url.pathname = `${url.pathname.replace(TRAILING_SLASHES_PATTERN, '')}${endpoint}`;
  return url.toString();
}

/**
 * Fetch the CIP-112 V2 SettlementFactory and per-choice context from any Token Standard registry. The request is
 * deliberately unauthenticated so Scan credentials are never forwarded to a third-party instrument registry.
 */
export const GetSettlementFactoryFromRegistry = createApiOperation<
  GetSettlementFactoryFromRegistryParams,
  GetSettlementFactoryFromRegistryResponse
>({
  paramsSchema: GetSettlementFactoryFromRegistryParamsSchema,
  method: 'POST',
  buildUrl: (params) => buildRegistryEndpoint(params.registryUrl),
  buildRequestData: (params) =>
    ({
      choiceArguments: params.choiceArguments,
      excludeDebugFields: params.excludeDebugFields ?? false,
    }) satisfies GetSettlementFactoryFromRegistryRequest,
  requestConfig: publicRequestConfig,
});
