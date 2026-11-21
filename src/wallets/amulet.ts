/**
 * Canton Coin (Splice `Amulet`) as the wallet layer reads it: its templates and its instrument id. Read-only: transfers
 * of Canton Coin are not part of the wallet layer yet.
 *
 * Canton Coin's instrument is `{admin: <DSO party>, id: 'Amulet'}`. A holding counts when it is a `splice-amulet`
 * `Amulet` or `LockedAmulet` signed by its DSO (the instrument admin) and its owner (see `parseHolding`). The DSO party
 * is pinned by `CantonCoinOptions.dsoParty`, else learnt from the registry's `/registry/metadata/v1/info` (`adminId`)
 * when `registryUrl` is set (`./amulet-registry`); while it is unknown, any DSO that signed counts, each as its own
 * instrument.
 */
import type { InstrumentMetadata } from './holdings';

/** Template ids of Splice's Canton Coin holdings, in package-name form. */
export const AMULET_TEMPLATES = {
  amulet: '#splice-amulet:Splice.Amulet:Amulet',
  /** An `Amulet` locked to a transfer in flight or another lock holder: it cannot be spent until unlocked. */
  lockedAmulet: '#splice-amulet:Splice.Amulet:LockedAmulet',
} as const;

/** Canton Coin's instrument id under its DSO (`amuletInstrumentId` in `splice-amulet`). */
export const AMULET_INSTRUMENT_ID = 'Amulet';

/**
 * Canton Coin's metadata as Scan answers it on the Canton Network (`spliceInstanceNames`), used when the DSO is pinned
 * but its registry was not asked or did not answer.
 */
export const CANTON_COIN_METADATA: InstrumentMetadata = Object.freeze({
  name: 'Canton Coin',
  symbol: 'CC',
  decimals: 10,
});
