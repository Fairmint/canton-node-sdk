import type { paths } from '../../../../../../../generated/token-standard/splice-api-token-metadata-v1/openapi/token-metadata-v1';

type GetInstrumentPath = '/registry/metadata/v1/instruments/{instrumentId}';

export const publicRegistryRequestConfig = {
  contentType: 'application/json',
  includeBearerToken: false,
} as const;

export type RegistryInstrument = paths[GetInstrumentPath]['get']['responses']['200']['content']['application/json'];

type RawRegistryInstrument = Omit<RegistryInstrument, 'totalSupply' | 'totalSupplyAsOf'> & {
  totalSupply?: string | null;
  totalSupplyAsOf?: string | null;
};

export function getRegistryApiUrl(scanApiUrl: string): string {
  return scanApiUrl.replace(/\/api\/scan\/?$/, '').replace(/\/$/, '');
}

export function normalizeRegistryInstrument(response: RegistryInstrument): RegistryInstrument {
  const raw = response as RawRegistryInstrument;
  const { totalSupply, totalSupplyAsOf, ...instrument } = raw;
  const normalized: RegistryInstrument = { ...instrument };

  if (totalSupply != null) {
    normalized.totalSupply = totalSupply;
  }
  if (totalSupplyAsOf != null) {
    normalized.totalSupplyAsOf = totalSupplyAsOf;
  }

  return normalized;
}
