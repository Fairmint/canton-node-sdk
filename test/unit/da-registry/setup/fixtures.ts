/**
 * Shared fixtures for the DA Registry setup tests: a DevNet and a MainNet declared state, a fixed clock, and config
 * variants built by editing a deep copy.
 */
import { DA_REGISTRY_PACKAGES, type DaRegistrySetupConfig } from '../../../../src/da-registry';

export const REGISTRAR = `registrar-devnet::1220${'a1'.repeat(32)}`;
export const HOLDER_A = `test-holder-a::1220${'a1'.repeat(32)}`;
export const HOLDER_B = `test-holder-b::1220${'a1'.repeat(32)}`;
export const OPERATOR = `auth0_007c65f857f1c3d599cb6df73775::1220${'d2'.repeat(32)}`;
export const DEVNET_SYNCHRONIZER = `global-domain::1220${'be'.repeat(32)}`;

export const MAINNET_REGISTRAR = `registrar-mainnet::1220${'4a'.repeat(32)}`;
export const MAINNET_OPERATOR = `auth0_007c6643538f2eadd3e573dd05b9::1220${'5b'.repeat(32)}`;
export const MAINNET_SYNCHRONIZER = `global-domain::1220${'b1'.repeat(32)}`;

/** Named in notes that ask a person to change the declared state. */
export const CONFIG_SOURCE = 'config/demo.devnet.yaml';

export const REGISTRAR_LABEL = 'Registrar (mints to itself, delivers and receives withdrawals)';
export const REGISTRAR_PREAPPROVAL_LABEL = 'Registrar (withdrawals arrive through it)';

const CLAIMS = {
  transfer: { property: 'canTransfer', value: 'DEMO' },
  redemption: { property: 'canRedeem', value: 'DEMO' },
};

const PACKAGES = DA_REGISTRY_PACKAGES.map((p) => ({ ...p }));

export const DEVNET_CONFIG: DaRegistrySetupConfig = {
  network: 'devnet',
  source: CONFIG_SOURCE,
  ledger: { synchronizerId: DEVNET_SYNCHRONIZER },
  registrar: { party: REGISTRAR },
  da: {
    apiUrl: 'https://api.utilities.digitalasset-dev.com',
    operatorParty: OPERATOR,
    providerApprovalTimeoutMinutes: 5,
    packages: { required: PACKAGES },
  },
  instrument: { id: 'DEMO', claims: CLAIMS, useBlockList: false },
  credentials: {
    id: 'DEMO allowlist',
    description: 'Approved by the registrar to hold DEMO',
    validUntil: '2027-04-30T00:00:00Z',
    renewWithinDays: 30,
    pruneUnlisted: true,
    parties: [
      { label: REGISTRAR_LABEL, party: REGISTRAR, claims: ['transfer', 'redemption'] },
      { label: 'Test holder A', party: HOLDER_A, claims: ['transfer', 'redemption'] },
      { label: 'Test holder B', party: HOLDER_B, claims: ['transfer', 'redemption'] },
    ],
  },
  preapprovals: [
    { label: REGISTRAR_PREAPPROVAL_LABEL, party: REGISTRAR },
    { label: 'Test holder A', party: HOLDER_A },
    { label: 'Test holder B', party: HOLDER_B },
  ],
  supply: { total: '1000000' },
  deliveries: [
    { label: 'Test holder A', party: HOLDER_A, minBalance: '10000' },
    { label: 'Test holder B', party: HOLDER_B, minBalance: '10000' },
  ],
};

/** MainNet: DA approves the provider by hand, the allowlist is the registrar only, and nothing is minted here. */
export const MAINNET_CONFIG: DaRegistrySetupConfig = {
  network: 'mainnet',
  ledger: { synchronizerId: MAINNET_SYNCHRONIZER },
  registrar: { party: MAINNET_REGISTRAR },
  da: {
    apiUrl: 'https://api.utilities.digitalasset.com',
    operatorParty: MAINNET_OPERATOR,
    providerApprovalTimeoutMinutes: 0,
    packages: { required: PACKAGES },
  },
  instrument: { id: 'DEMO', claims: CLAIMS, useBlockList: false },
  credentials: {
    id: 'DEMO allowlist',
    description: 'Approved by the registrar to hold DEMO',
    validUntil: '2027-04-30T00:00:00Z',
    renewWithinDays: 30,
    pruneUnlisted: false,
    parties: [{ label: REGISTRAR_LABEL, party: MAINNET_REGISTRAR, claims: ['transfer', 'redemption'] }],
  },
  preapprovals: [{ label: REGISTRAR_PREAPPROVAL_LABEL, party: MAINNET_REGISTRAR }],
  supply: null,
  deliveries: [],
};

/** The fixed "now" every step and the simulator see. */
export const NOW = new Date('2026-10-26T12:00:00.000Z');
export const clock = (): Date => new Date(NOW.getTime());

export function isoAt(offsetMs: number): string {
  return new Date(NOW.getTime() + offsetMs).toISOString();
}

export const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;

/** A deep copy of `base` after `mutate` edits it. */
export function configVariant(
  base: DaRegistrySetupConfig,
  mutate: (raw: DaRegistrySetupConfig) => void = () => undefined
): DaRegistrySetupConfig {
  const raw = JSON.parse(JSON.stringify(base)) as DaRegistrySetupConfig;
  mutate(raw);
  return raw;
}

/** Removes `party` from every list of the config: credentials, preapprovals and deliveries. */
export function withoutParty(raw: DaRegistrySetupConfig, party: string): void {
  raw.credentials.parties = raw.credentials.parties.filter((p) => p.party !== party);
  raw.preapprovals = raw.preapprovals.filter((p) => p.party !== party);
  raw.deliveries = raw.deliveries.filter((d) => d.party !== party);
}

/** `list[index]`, failing the test instead of returning undefined. */
export function nth<T>(list: readonly T[], index: number): T {
  const item = list[index];
  if (item === undefined) throw new Error(`no item at index ${index} (length ${list.length})`);
  return item;
}
