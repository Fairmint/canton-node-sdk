import {
  ContractId,
  PackageId,
  PackageName,
  PartyId,
  TemplateId,
  type Command,
  type DisclosedContract,
  type GetContractByIdCreatedEvent,
  type GetContractByIdParams,
  type LedgerJsonApiClient,
  type LedgerJsonValue,
} from '../../../src';

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
    const contractId = ContractId(`00${'ab'.repeat(32)}`);
    const packageId = PackageId('12'.repeat(32));
    const partyId = PartyId('validator::fingerprint');
    const contractLookup: GetContractByIdParams = { contractId, queryingParties: [partyId] };
    const contractData = {
      contractId,
      templateId: TemplateId(`${packageId}:Module:Template`),
      contractKeyHash: '',
      createArgument: { owner: partyId } satisfies LedgerJsonValue,
      witnessParties: [partyId],
      signatories: [partyId],
      observers: [],
      createdAt: '2026-07-13T12:00:00Z',
      packageName: PackageName('package-name'),
      representativePackageId: packageId,
    } satisfies GetContractByIdCreatedEvent;
    const ledger: Pick<LedgerJsonApiClient, 'getActiveContracts' | 'getContractById'> = {
      getActiveContracts: jest.fn(),
      getContractById: jest.fn(),
    };

    expect(command.CreateCommand.templateId).toBe('#package:Module:Template');
    expect(disclosedContract.contractId).toBe('00contract');
    expect(contractLookup.queryingParties).toEqual([partyId]);
    expect(contractData.contractId).toBe(contractId);
    expect(ledger.getActiveContracts).toBeDefined();
    expect(ledger.getContractById).toBeDefined();
  });
});
