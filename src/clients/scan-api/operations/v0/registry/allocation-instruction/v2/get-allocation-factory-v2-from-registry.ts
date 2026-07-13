import { z } from 'zod';
import { createApiOperation } from '../../../../../../../core';
import { RecordSchema } from '../../../../../../ledger-json-api/schemas/base';

const endpoint = '/registry/allocation-instruction/v2/allocation-factory';
const publicRequestConfig = {
  contentType: 'application/json',
  includeBearerToken: false,
} as const;

const RegistryUrlSchema = z.url({
  protocol: /^https?$/,
  error: 'registryUrl must use http or https',
});

export const GetAllocationFactoryV2FromRegistryParamsSchema = z.object({
  /** Base URL advertised for the instrument admin's Token Standard registry. */
  registryUrl: RegistryUrlSchema,
  /** Complete AllocationFactory_Allocate choice argument with empty context and metadata. */
  choiceArguments: RecordSchema,
  excludeDebugFields: z.boolean().optional(),
});

export type GetAllocationFactoryV2FromRegistryParams = z.infer<typeof GetAllocationFactoryV2FromRegistryParamsSchema>;

export interface GetAllocationFactoryV2FromRegistryRequest {
  readonly choiceArguments: Readonly<Record<string, unknown>>;
  readonly excludeDebugFields: boolean;
}

export interface GetAllocationFactoryV2FromRegistryDisclosedContract {
  readonly templateId: string;
  readonly contractId: string;
  readonly createdEventBlob: string;
  readonly synchronizerId: string;
}

export interface GetAllocationFactoryV2FromRegistryResponse {
  readonly factoryId: string;
  readonly choiceContext: {
    readonly choiceContextData: Readonly<Record<string, unknown>>;
    readonly disclosedContracts: readonly GetAllocationFactoryV2FromRegistryDisclosedContract[];
  };
}

function buildRegistryEndpoint(registryUrl: string): string {
  const url = new URL(registryUrl);
  url.username = '';
  url.password = '';
  url.search = '';
  url.hash = '';
  url.pathname = `${url.pathname.replace(/\/+$/, '')}${endpoint}`;
  return url.toString();
}

/**
 * Fetch the CIP-112 V2 AllocationFactory and its per-choice context. Scan credentials are deliberately not forwarded to
 * the third-party instrument registry.
 */
export const GetAllocationFactoryV2FromRegistry = createApiOperation<
  GetAllocationFactoryV2FromRegistryParams,
  GetAllocationFactoryV2FromRegistryResponse
>({
  paramsSchema: GetAllocationFactoryV2FromRegistryParamsSchema,
  method: 'POST',
  buildUrl: (params) => buildRegistryEndpoint(params.registryUrl),
  buildRequestData: (params) =>
    ({
      choiceArguments: params.choiceArguments,
      excludeDebugFields: params.excludeDebugFields ?? false,
    }) satisfies GetAllocationFactoryV2FromRegistryRequest,
  requestConfig: publicRequestConfig,
});
