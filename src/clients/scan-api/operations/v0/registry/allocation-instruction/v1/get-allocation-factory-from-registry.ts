import { z } from 'zod';
import { createApiOperation } from '../../../../../../../core';
import type {
  components,
  paths,
} from '../../../../../../../generated/token-standard/splice-api-token-allocation-instruction-v1/openapi/allocation-instruction-v1';
import { RecordSchema } from '../../../../../../ledger-json-api/schemas/base';

type ApiPath = '/registry/allocation-instruction/v1/allocation-factory';

const endpoint = '/registry/allocation-instruction/v1/allocation-factory';
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

export const GetAllocationFactoryFromRegistryParamsSchema = z.object({
  /** Base URL advertised for the instrument admin's Token Standard registry. */
  registryUrl: RegistryUrlSchema,
  /** Complete AllocationFactory_Allocate choice argument used to derive context. */
  choiceArguments: RecordSchema,
  excludeDebugFields: z.boolean().optional(),
});

export type GetAllocationFactoryFromRegistryParams = z.infer<typeof GetAllocationFactoryFromRegistryParamsSchema>;
export type GetAllocationFactoryFromRegistryRequest = components['schemas']['GetFactoryRequest'];
export type GetAllocationFactoryFromRegistryResponse =
  paths[ApiPath]['post']['responses']['200']['content']['application/json'];

function buildRegistryEndpoint(registryUrl: string): string {
  const url = new URL(registryUrl);
  url.search = '';
  url.hash = '';
  url.pathname = `${url.pathname.replace(/\/$/, '')}${endpoint}`;
  return url.toString();
}

/**
 * Fetch the AllocationFactory and per-choice context from any Token Standard registry. The request is deliberately
 * unauthenticated so Scan credentials are never forwarded to a third-party instrument registry.
 */
export const GetAllocationFactoryFromRegistry = createApiOperation<
  GetAllocationFactoryFromRegistryParams,
  GetAllocationFactoryFromRegistryResponse
>({
  paramsSchema: GetAllocationFactoryFromRegistryParamsSchema,
  method: 'POST',
  buildUrl: (params) => buildRegistryEndpoint(params.registryUrl),
  buildRequestData: (params) => ({
    choiceArguments: params.choiceArguments,
    excludeDebugFields: params.excludeDebugFields ?? false,
  }),
  requestConfig: publicRequestConfig,
});
