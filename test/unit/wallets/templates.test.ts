import { isTemplate } from '../../../src/wallets/templates';
import type { ActiveContract } from '../../../src/wallets/types';

const HOLDING = '#utility-registry-holding-v0:Utility.Registry.Holding.V0.Holding:Holding';

const contract = (templateId: string, packageName: string): ActiveContract => ({
  contractId: '00c',
  templateId,
  packageName,
  signatories: [],
  createArgument: null,
});

describe('isTemplate', () => {
  it('matches the template by Module:Entity and package name, in any package version', () => {
    expect(
      isTemplate(contract('pkgA:Utility.Registry.Holding.V0.Holding:Holding', 'utility-registry-holding-v0'), HOLDING)
    ).toBe(true);
  });

  it('refuses the same Module:Entity of another package, and another entity of the package', () => {
    expect(isTemplate(contract('pkgA:Utility.Registry.Holding.V0.Holding:Holding', 'evil-v0'), HOLDING)).toBe(false);
    expect(
      isTemplate(contract('pkgA:Utility.Registry.Holding.V0.Holding:Other', 'utility-registry-holding-v0'), HOLDING)
    ).toBe(false);
  });

  it('matches nothing for an id that is not in package-name form', () => {
    const id = 'pkgA:Utility.Registry.Holding.V0.Holding:Holding';
    expect(isTemplate(contract(id, 'utility-registry-holding-v0'), id)).toBe(false);
  });
});
