import { type NetworkType, type ProviderType } from '../../core/types';

export interface ScanSvEndpoint {
  /** Human-readable SV name as published publicly. */
  svName: string;
  /** Base host URL (no trailing /api/scan). */
  hostUrl: string;
  /** Scan service version as published publicly. */
  version: string;
}

// Source of these lists: https://canton.foundation/sv-network-status/#devnet
const MAINNET_ENDPOINTS: readonly ScanSvEndpoint[] = [
  {
    svName: 'C7-Technology-Services-Limited',
    hostUrl: 'https://scan.sv-1.global.canton.network.c7.digital',
    version: '0.5.4',
  },
  { svName: 'Cumberland-1', hostUrl: 'https://scan.sv-1.global.canton.network.cumberland.io', version: '0.5.4' },
  { svName: 'Cumberland-2', hostUrl: 'https://scan.sv-2.global.canton.network.cumberland.io', version: '0.5.4' },
  { svName: 'Digital-Asset-1', hostUrl: 'https://scan.sv-1.global.canton.network.digitalasset.com', version: '0.5.4' },
  { svName: 'Digital-Asset-2', hostUrl: 'https://scan.sv-2.global.canton.network.digitalasset.com', version: '0.5.4' },
  { svName: 'Five-North-1', hostUrl: 'https://scan.sv-1.global.canton.network.fivenorth.io', version: '0.5.4' },
  {
    svName: 'Global-Synchronizer-Foundation',
    hostUrl: 'https://scan.sv-1.global.canton.network.sync.global',
    version: '0.5.4',
  },
  {
    svName: 'Liberty-City-Ventures-1',
    hostUrl: 'https://scan.sv-1.global.canton.network.lcv.mpch.io',
    version: '0.5.4',
  },
  { svName: 'MPC-Holding-Inc', hostUrl: 'https://scan.sv-1.global.canton.network.mpch.io', version: '0.5.4' },
  { svName: 'Orb-1-LP-1', hostUrl: 'https://scan.sv-1.global.canton.network.orb1lp.mpch.io', version: '0.5.4' },
  { svName: 'Proof-Group-1', hostUrl: 'https://scan.sv-1.global.canton.network.proofgroup.xyz', version: '0.5.4' },
  { svName: 'SV-Nodeops-Limited', hostUrl: 'https://scan.sv.global.canton.network.sv-nodeops.com', version: '0.5.4' },
  { svName: 'Tradeweb-Markets-1', hostUrl: 'https://scan.sv-1.global.canton.network.tradeweb.com', version: '0.5.4' },
];

const DEVNET_ENDPOINTS: readonly ScanSvEndpoint[] = [
  {
    svName: 'C7-Technology-Services-Limited',
    hostUrl: 'https://scan.sv-1.dev.global.canton.network.c7.digital',
    version: '0.5.4',
  },
  { svName: 'Cumberland-1', hostUrl: 'https://scan.sv-1.dev.global.canton.network.cumberland.io', version: '0.5.4' },
  { svName: 'Cumberland-2', hostUrl: 'https://scan.sv-2.dev.global.canton.network.cumberland.io', version: '0.5.4' },
  {
    svName: 'DA-Helm-Test-Node',
    hostUrl: 'https://scan.sv.dev.global.canton.network.digitalasset.com',
    version: '0.5.4',
  },
  {
    svName: 'Digital-Asset-1',
    hostUrl: 'https://scan.sv-1.dev.global.canton.network.digitalasset.com',
    version: '0.5.4',
  },
  {
    svName: 'Digital-Asset-2',
    hostUrl: 'https://scan.sv-2.dev.global.canton.network.digitalasset.com',
    version: '0.5.4',
  },
  { svName: 'Five-North-1', hostUrl: 'https://scan.sv-1.dev.global.canton.network.fivenorth.io', version: '0.5.4' },
  {
    svName: 'Global-Synchronizer-Foundation',
    hostUrl: 'https://scan.sv-1.dev.global.canton.network.sync.global',
    version: '0.5.4',
  },
  {
    svName: 'Liberty-City-Ventures-1',
    hostUrl: 'https://scan.sv-1.dev.global.canton.network.lcv.mpch.io',
    version: '0.5.4',
  },
  { svName: 'MPC-Holding-Inc', hostUrl: 'https://scan.sv-1.dev.global.canton.network.mpch.io', version: '0.5.4' },
  { svName: 'Orb-1-LP-1', hostUrl: 'https://scan.sv-1.dev.global.canton.network.orb1lp.mpch.io', version: '0.5.4' },
  { svName: 'Proof-Group-1', hostUrl: 'https://scan.sv-1.dev.global.canton.network.proofgroup.xyz', version: '0.5.4' },
  {
    svName: 'SV-Nodeops-Limited',
    hostUrl: 'https://scan.sv.dev.global.canton.network.sv-nodeops.com',
    version: '0.5.4',
  },
  {
    svName: 'Tradeweb-Markets-1',
    hostUrl: 'https://scan.sv-1.dev.global.canton.network.tradeweb.com',
    version: '0.5.4',
  },
];

export function getScanSvEndpoints(network: NetworkType): readonly ScanSvEndpoint[] {
  if (network === 'devnet') return DEVNET_ENDPOINTS;
  if (network === 'mainnet') return MAINNET_ENDPOINTS;
  return [];
}

function normalizeProviderKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function toScanApiUrl(hostUrl: string): string {
  const trimmed = hostUrl.replace(/\/$/, '');
  return `${trimmed}/api/scan`;
}

/**
 * Returns scan API base URLs ordered for retry.
 *
 * If a provider is supplied, its own scan URL (if known) is tried first, then the rest.
 */
export function resolveScanApiUrls(network: NetworkType, provider?: ProviderType): readonly string[] {
  const endpoints = getScanSvEndpoints(network);
  if (endpoints.length === 0) {
    return [];
  }

  const preferredKey = provider ? normalizeProviderKey(provider) : undefined;

  const preferred = preferredKey
    ? endpoints.filter((e) => normalizeProviderKey(e.svName) === preferredKey).map((e) => toScanApiUrl(e.hostUrl))
    : [];

  const rest = endpoints
    .filter((e) => (preferredKey ? normalizeProviderKey(e.svName) !== preferredKey : true))
    .map((e) => toScanApiUrl(e.hostUrl));

  return [...preferred, ...rest];
}
