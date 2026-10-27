import { DA_REGISTRY_TEMPLATES, isDaRegistryTemplate } from '../../../src/da-registry';

describe('isDaRegistryTemplate', () => {
  it('matches contracts in package-id form under any package version', () => {
    const contract = {
      templateId:
        '8c654487d9f5fb195fbcdd7b44cd8e365b1ea39c15ae62ce6c7a48343f1210dd:Utility.Registry.V0.Rule.Transfer:TransferRule',
    };
    expect(isDaRegistryTemplate(contract, 'transferRule')).toBe(true);
  });

  it('matches the package-name form itself', () => {
    expect(isDaRegistryTemplate({ templateId: DA_REGISTRY_TEMPLATES.credential }, 'credential')).toBe(true);
  });

  it('rejects other templates and partial suffixes', () => {
    const contract = {
      templateId: 'deadbeef:Utility.Registry.V0.Rule.Transfer:TransferRuleExtra',
    };
    expect(isDaRegistryTemplate(contract, 'transferRule')).toBe(false);
    expect(
      isDaRegistryTemplate(
        { templateId: 'deadbeef:Utility.Registry.App.V0.Service.Provider:ProviderService' },
        'registrarService'
      )
    ).toBe(false);
  });
});
