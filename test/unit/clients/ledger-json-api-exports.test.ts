import type { Command, DisclosedContract, LedgerJsonApiClient } from '../../../src';

describe('ledger JSON API public exports', () => {
  it('exports command and disclosed-contract types from the package root', () => {
    const command: Command = {
      CreateCommand: {
        templateId: '#package:Module:Template',
        createArguments: {},
      },
    };
    const disclosedContract: DisclosedContract = {
      templateId: '#package:Module:Template',
      contractId: '00contract',
      createdEventBlob: 'blob',
      synchronizerId: 'sync::id',
    };
    const ledger: Pick<LedgerJsonApiClient, 'getActiveContracts'> = {
      getActiveContracts: jest.fn(),
    };

    expect(command.CreateCommand.templateId).toBe('#package:Module:Template');
    expect(disclosedContract.contractId).toBe('00contract');
    expect(ledger.getActiveContracts).toBeDefined();
  });
});
