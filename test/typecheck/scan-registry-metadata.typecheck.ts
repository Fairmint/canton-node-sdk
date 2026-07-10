import { z } from 'zod';
import type { ScanApiClient } from '../../src/clients/scan-api';
import {
  GetInstrumentParamsSchema,
  type GetInstrumentParams,
  type GetInstrumentResponse,
} from '../../src/clients/scan-api/operations/v0/registry/metadata/v1/get-instrument';
import { type GetRegistryInfoResponse } from '../../src/clients/scan-api/operations/v0/registry/metadata/v1/get-registry-info';
import {
  ListInstrumentsParamsSchema,
  type ListInstrumentsParams,
  type ListInstrumentsResponse,
} from '../../src/clients/scan-api/operations/v0/registry/metadata/v1/list-instruments';
import type { paths } from '../../src/generated/token-standard/splice-api-token-metadata-v1/openapi/token-metadata-v1';

type Equal<Left, Right> =
  (<Type>() => Type extends Left ? 1 : 2) extends <Type>() => Type extends Right ? 1 : 2
    ? (<Type>() => Type extends Right ? 1 : 2) extends <Type>() => Type extends Left ? 1 : 2
      ? true
      : false
    : false;
type Assert<Condition extends true> = Condition;

type GetInstrumentPath = '/registry/metadata/v1/instruments/{instrumentId}';
type GetRegistryInfoPath = '/registry/metadata/v1/info';
type ListInstrumentsPath = '/registry/metadata/v1/instruments';

type GeneratedGetInstrumentParams = paths[GetInstrumentPath]['get']['parameters']['path'];
type GeneratedGetInstrumentResponse =
  paths[GetInstrumentPath]['get']['responses']['200']['content']['application/json'];
type GeneratedGetRegistryInfoResponse =
  paths[GetRegistryInfoPath]['get']['responses']['200']['content']['application/json'];
type GeneratedListInstrumentsParams = NonNullable<paths[ListInstrumentsPath]['get']['parameters']['query']>;
type GeneratedListInstrumentsResponse =
  paths[ListInstrumentsPath]['get']['responses']['200']['content']['application/json'];

export type GetInstrumentParamsMatchSpec = Assert<Equal<GetInstrumentParams, GeneratedGetInstrumentParams>>;
export type GetInstrumentSchemaMatchesSpec = Assert<
  Equal<z.output<typeof GetInstrumentParamsSchema>, GeneratedGetInstrumentParams>
>;
export type GetInstrumentResponseMatchesSpec = Assert<Equal<GetInstrumentResponse, GeneratedGetInstrumentResponse>>;
export type GetRegistryInfoResponseMatchesSpec = Assert<
  Equal<GetRegistryInfoResponse, GeneratedGetRegistryInfoResponse>
>;
export type ListInstrumentsParamsMatchSpec = Assert<Equal<ListInstrumentsParams, GeneratedListInstrumentsParams>>;
export type ListInstrumentsSchemaMatchesSpec = Assert<
  Equal<z.output<typeof ListInstrumentsParamsSchema>, GeneratedListInstrumentsParams>
>;
export type ListInstrumentsResponseMatchesSpec = Assert<
  Equal<ListInstrumentsResponse, GeneratedListInstrumentsResponse>
>;

function assertClientSurface(client: ScanApiClient): void {
  void client.getRegistryInfo();
  void client.listInstruments({ pageSize: 25, pageToken: 'next-page' });

  // @ts-expect-error pageSize must be a number from the generated OpenAPI query contract.
  void client.listInstruments({ pageSize: '25' });
  // @ts-expect-error Unknown query parameters are not part of the generated contract.
  void client.listInstruments({ pageSize: 25, unknown: true });
}

void assertClientSurface;
