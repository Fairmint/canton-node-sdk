/**
 * Scan API endpoint configurations for mainnet and devnet.
 *
 * Source: https://canton.foundation/sv-network-status/#devnet
 *
 * These are public endpoints that can be used without authentication.
 * They are rate limited and may occasionally go down, so the ScanApiClient
 * rotates through available endpoints on failure.
 */

import { type NetworkType } from '../../core/types';

export interface ScanEndpoint {
  /** SV operator name */
  name: string;
  /** Scan API base URL */
  url: string;
}

/** Mainnet scan endpoints */
export const MAINNET_SCAN_ENDPOINTS: ScanEndpoint[] = [
  { name: 'C7-Technology-Services-Limited', url: 'https://scan.sv-1.global.canton.network.c7.digital' },
  { name: 'Cumberland-1', url: 'https://scan.sv-1.global.canton.network.cumberland.io' },
  { name: 'Cumberland-2', url: 'https://scan.sv-2.global.canton.network.cumberland.io' },
  { name: 'Digital-Asset-1', url: 'https://scan.sv-1.global.canton.network.digitalasset.com' },
  { name: 'Digital-Asset-2', url: 'https://scan.sv-2.global.canton.network.digitalasset.com' },
  { name: 'Five-North-1', url: 'https://scan.sv-1.global.canton.network.fivenorth.io' },
  { name: 'Global-Synchronizer-Foundation', url: 'https://scan.sv-1.global.canton.network.sync.global' },
  { name: 'Liberty-City-Ventures-1', url: 'https://scan.sv-1.global.canton.network.lcv.mpch.io' },
  { name: 'MPC-Holding-Inc', url: 'https://scan.sv-1.global.canton.network.mpch.io' },
  { name: 'Orb-1-LP-1', url: 'https://scan.sv-1.global.canton.network.orb1lp.mpch.io' },
  { name: 'Proof-Group-1', url: 'https://scan.sv-1.global.canton.network.proofgroup.xyz' },
  { name: 'SV-Nodeops-Limited', url: 'https://scan.sv.global.canton.network.sv-nodeops.com' },
  { name: 'Tradeweb-Markets-1', url: 'https://scan.sv-1.global.canton.network.tradeweb.com' },
];

/** Devnet scan endpoints */
export const DEVNET_SCAN_ENDPOINTS: ScanEndpoint[] = [
  { name: 'C7-Technology-Services-Limited', url: 'https://scan.sv-1.dev.global.canton.network.c7.digital' },
  { name: 'Cumberland-1', url: 'https://scan.sv-1.dev.global.canton.network.cumberland.io' },
  { name: 'Cumberland-2', url: 'https://scan.sv-2.dev.global.canton.network.cumberland.io' },
  { name: 'DA-Helm-Test-Node', url: 'https://scan.sv.dev.global.canton.network.digitalasset.com' },
  { name: 'Digital-Asset-1', url: 'https://scan.sv-1.dev.global.canton.network.digitalasset.com' },
  { name: 'Digital-Asset-2', url: 'https://scan.sv-2.dev.global.canton.network.digitalasset.com' },
  { name: 'Five-North-1', url: 'https://scan.sv-1.dev.global.canton.network.fivenorth.io' },
  { name: 'Global-Synchronizer-Foundation', url: 'https://scan.sv-1.dev.global.canton.network.sync.global' },
  { name: 'Liberty-City-Ventures-1', url: 'https://scan.sv-1.dev.global.canton.network.lcv.mpch.io' },
  { name: 'MPC-Holding-Inc', url: 'https://scan.sv-1.dev.global.canton.network.mpch.io' },
  { name: 'Orb-1-LP-1', url: 'https://scan.sv-1.dev.global.canton.network.orb1lp.mpch.io' },
  { name: 'Proof-Group-1', url: 'https://scan.sv-1.dev.global.canton.network.proofgroup.xyz' },
  { name: 'SV-Nodeops-Limited', url: 'https://scan.sv.dev.global.canton.network.sv-nodeops.com' },
  { name: 'Tradeweb-Markets-1', url: 'https://scan.sv-1.dev.global.canton.network.tradeweb.com' },
];

/** Get scan endpoints for a given network type */
export function getScanEndpoints(network: NetworkType): ScanEndpoint[] {
  switch (network) {
    case 'mainnet':
      return MAINNET_SCAN_ENDPOINTS;
    case 'devnet':
      return DEVNET_SCAN_ENDPOINTS;
    case 'testnet':
      // Testnet uses same endpoints as devnet
      return DEVNET_SCAN_ENDPOINTS;
    case 'localnet':
      // Localnet has no public scan endpoints
      return [];
    default:
      return [];
  }
}
