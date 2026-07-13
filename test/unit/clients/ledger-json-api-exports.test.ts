import {
  ContractId,
  LedgerSynchronizerIdSchema,
  NonEmptyDarFileSchema,
  PackageId,
  PackageName,
  PartyId,
  SynchronizerId,
  TemplateId,
  UploadDarResponseSchema,
  ValidateDarResponseSchema,
  type Command,
  type DisclosedContract,
  type GetContractByIdCreatedEvent,
  type GetContractByIdParams,
  type LedgerJsonApiClient,
  type LedgerJsonValue,
  type UploadDarParams,
  type UploadDarResponse,
  type ValidateDarParams,
  type ValidateDarResponse,
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
    const uploadDarParams = {
      darFile: NonEmptyDarFileSchema.parse(Buffer.from('dar')),
      vetAllPackages: false,
    } satisfies UploadDarParams;
    const validateDarParams = { darFile: Buffer.from('dar') } satisfies ValidateDarParams;
    const uploadDarResponse = UploadDarResponseSchema.parse({}) satisfies UploadDarResponse;
    const synchronizerId = LedgerSynchronizerIdSchema.parse('sync::namespace') satisfies SynchronizerId;
    const validateDarResponse: ValidateDarResponse = undefined;
    ValidateDarResponseSchema.parse('');
    const ledger: Pick<LedgerJsonApiClient, 'getActiveContracts' | 'getContractById' | 'uploadDar' | 'validateDar'> = {
      getActiveContracts: jest.fn(),
      getContractById: jest.fn(),
      uploadDar: jest.fn(),
      validateDar: jest.fn(),
    };

    expect(command.CreateCommand.templateId).toBe('#package:Module:Template');
    expect(disclosedContract.contractId).toBe('00contract');
    expect(contractLookup.queryingParties).toEqual([partyId]);
    expect(contractData.contractId).toBe(contractId);
    expect(uploadDarParams.vetAllPackages).toBe(false);
    expect(validateDarParams.darFile).toEqual(Buffer.from('dar'));
    expect(uploadDarResponse).toEqual({});
    expect(synchronizerId).toBe(SynchronizerId('sync::namespace'));
    expect(validateDarResponse).toBeUndefined();
    expect(ledger.getActiveContracts).toBeDefined();
    expect(ledger.getContractById).toBeDefined();
    expect(ledger.uploadDar).toBeDefined();
    expect(ledger.validateDar).toBeDefined();
  });
});
