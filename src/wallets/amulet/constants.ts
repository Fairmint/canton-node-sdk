/**
 * Canton Coin (Splice `Amulet`) as the wallet layer reads it: its templates, its instrument id, its metadata and the
 * public registries (Scans) that serve its CIP-56 registry API.
 *
 * Canton Coin's instrument is `{admin: <DSO party>, id: 'Amulet'}`. Which DSO party is genuine is decided in one place,
 * `createAmuletRegistry` (`./registry`): the pinned `cantonCoin.dsoParty`, else the registry's `adminId`.
 */
import type { DaNetwork } from '../da-utilities/client';
import type { InstrumentMetadata } from '../holdings';

/** Template ids of Splice's Canton Coin contracts a wallet reads, in package-name form. */
export const AMULET_TEMPLATES = {
  amulet: '#splice-amulet:Splice.Amulet:Amulet',
  /** An `Amulet` locked to a transfer in flight or another lock holder: it cannot be spent until unlocked. */
  lockedAmulet: '#splice-amulet:Splice.Amulet:LockedAmulet',
  /**
   * A pending Canton Coin transfer (a CIP-56 `TransferInstruction`, for example a faucet's offer). Signatories: the DSO
   * (the instrument admin) and the sender.
   */
  transferInstruction: '#splice-amulet:Splice.AmuletTransferInstruction:AmuletTransferInstruction',
} as const;

/** Canton Coin's instrument id under its DSO (`amuletInstrumentId` in `splice-amulet`). */
export const AMULET_INSTRUMENT_ID = 'Amulet';

/**
 * Canton Coin's metadata as Scan answers it on the Canton Network (`spliceInstanceNames`), used for a confirmed DSO's
 * Canton Coin when the registry's own answer is not available.
 */
export const CANTON_COIN_METADATA: InstrumentMetadata = Object.freeze({
  name: 'Canton Coin',
  symbol: 'CC',
  decimals: 10,
});

/**
 * The default Canton Coin registry per network: SV-1's Scan, whose registry API is public with CORS open (checked 21
 * November 2026: `GET /registry/metadata/v1/info` answered with the DSO party and reflected the page's origin).
 */
export const AMULET_REGISTRY_BASE_URLS: Readonly<Record<DaNetwork, string>> = {
  devnet: 'https://scan.sv-1.dev.global.canton.network.sync.global',
  mainnet: 'https://scan.sv-1.global.canton.network.sync.global',
};
