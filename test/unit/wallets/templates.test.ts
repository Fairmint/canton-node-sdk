import { contractMatchesFilter } from '../../../src/wallets/templates';
import type { ActiveContract } from '../../../src/wallets/types';

function withViews(...interfaceIds: string[]): ActiveContract {
  return {
    contractId: '00c',
    templateId: 'pkgT:M:T',
    packageName: 'tpl',
    signatories: [],
    createArgument: null,
    interfaceViews: interfaceIds.map((interfaceId) => ({ interfaceId, viewValue: {} })),
  };
}

describe('contractMatchesFilter with interface filters', () => {
  it('matches a package-id interface filter only on the exact interface id', () => {
    const onlyB = withViews('pkgB:Api.Holding:Holding');
    expect(contractMatchesFilter(onlyB, { interfaceId: 'pkgA:Api.Holding:Holding' })).toBe(false);
    expect(contractMatchesFilter(onlyB, { interfaceId: 'pkgB:Api.Holding:Holding' })).toBe(true);
  });

  it('matches a package-name interface filter by Module:Entity', () => {
    expect(
      contractMatchesFilter(withViews('pkgX:Api.Holding:Holding'), { interfaceId: '#holding-api:Api.Holding:Holding' })
    ).toBe(true);
    expect(
      contractMatchesFilter(withViews('pkgX:Api.Other:Other'), { interfaceId: '#holding-api:Api.Holding:Holding' })
    ).toBe(false);
  });
});
