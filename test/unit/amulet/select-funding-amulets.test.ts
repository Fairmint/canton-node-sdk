import { ContractId, DomainId, PartyId, TemplateId } from '../../../src/core/branded-types';
import { selectLockedAmuletForAmount } from '../../../src/utils/amulet/select-funding-amulets';
import type { LockedAmulet } from '../../../src/utils/amulet/types';

const buildAmulet = (overrides: Partial<LockedAmulet>): LockedAmulet => ({
  contractId: ContractId('cid'),
  templateId: TemplateId('temp'),
  owner: PartyId('owner'),
  holders: [],
  lockExpiresAt: null,
  effectiveAmount: 100,
  domainId: DomainId('domain'),
  createdEventBlob: 'blob',
  ...overrides,
});

describe('selectLockedAmuletForAmount', () => {
  const amulets: LockedAmulet[] = [
    buildAmulet({ contractId: ContractId('small'), effectiveAmount: 50 }),
    buildAmulet({ contractId: ContractId('medium'), effectiveAmount: 250 }),
    buildAmulet({ contractId: ContractId('large'), effectiveAmount: 600 }),
  ];

  it('returns the smallest amulet that satisfies the amount', () => {
    const selected = selectLockedAmuletForAmount(amulets, 120);
    expect(selected?.contractId).toBe('medium');
  });

  it('rejects amulets with multiple holders when requireExclusiveHolder is true', () => {
    const shared = buildAmulet({
      contractId: ContractId('shared'),
      holders: [PartyId('a'), PartyId('b')],
      effectiveAmount: 500,
    });
    const selected = selectLockedAmuletForAmount([...amulets, shared], 400, { requireExclusiveHolder: true });
    expect(selected?.contractId).toBe('large');
  });

  it('skips expired locks when rejectExpiredLocks is true', () => {
    const expired = buildAmulet({
      contractId: ContractId('expired'),
      lockExpiresAt: new Date(Date.now() - 1000).toISOString(),
      effectiveAmount: 1000,
    });
    const selected = selectLockedAmuletForAmount([...amulets, expired], 700, {
      rejectExpiredLocks: true,
      nowMs: Date.now(),
    });
    expect(selected).toBeNull();
  });
});
