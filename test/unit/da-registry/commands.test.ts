import {
  acceptMintOffer,
  acceptRegistrarServiceRequest,
  archiveAndCreateInstrumentConfiguration,
  archiveAndCreateProviderConfiguration,
  archiveDaRegistryContract,
  archiveInstrumentConfiguration,
  cancelMintOffer,
  createAllocationFactory,
  createCredential,
  createInstrumentConfiguration,
  createProviderConfiguration,
  createTransferPreapproval,
  createTransferRule,
  DA_REGISTRY_CONTEXT_KEYS,
  DA_REGISTRY_TEMPLATES,
  deleteRejectedRegistrarServiceRequest,
  issuerHeldCredential,
  mintChoiceContext,
  offerMint,
  requestAndAcceptRegistrarService,
  requestProviderService,
  transferViaFactory,
} from '../../../src/da-registry';
import { type LedgerCommand } from '../../../src/utils/ledger';
import { TOKEN_STANDARD_V1_TRANSFER_FACTORY_INTERFACE_ID } from '../../../src/utils/token-standard';

const OPERATOR = 'operator::1220aa';
const OTA = 'ota::1220bb';

function exercise(command: LedgerCommand): Extract<LedgerCommand, { ExerciseCommand: unknown }>['ExerciseCommand'] {
  if (!('ExerciseCommand' in command)) throw new Error('expected an ExerciseCommand');
  return command.ExerciseCommand;
}

describe('provider and registrar onboarding commands', () => {
  it('requests the provider service', () => {
    expect(requestProviderService(OPERATOR, OTA)).toEqual({
      CreateCommand: {
        templateId: DA_REGISTRY_TEMPLATES.providerServiceRequest,
        createArguments: { operator: OPERATOR, provider: OTA },
      },
    });
  });

  it('creates a requirement-free provider configuration', () => {
    expect(createProviderConfiguration('svc-1')).toEqual({
      ExerciseCommand: {
        templateId: DA_REGISTRY_TEMPLATES.providerService,
        contractId: 'svc-1',
        choice: 'ProviderService_CreateProviderConfiguration',
        choiceArgument: { registrarRequirements: [], holderRequirements: [] },
      },
    });
  });

  it('replaces a provider configuration in one choice', () => {
    expect(archiveAndCreateProviderConfiguration('svc-1', 'cfg-1')).toEqual({
      ExerciseCommand: {
        templateId: DA_REGISTRY_TEMPLATES.providerService,
        contractId: 'svc-1',
        choice: 'ProviderService_ArchiveAndCreateProviderConfiguration',
        choiceArgument: { cid: 'cfg-1', payload: { registrarRequirements: [], holderRequirements: [] } },
      },
    });
  });

  it('requests and accepts the registrar service in one transaction', () => {
    expect(requestAndAcceptRegistrarService(OPERATOR, OTA, 'cfg-1')).toEqual({
      CreateAndExerciseCommand: {
        templateId: DA_REGISTRY_TEMPLATES.registrarServiceRequest,
        createArguments: {
          operator: OPERATOR,
          provider: OTA,
          registrar: OTA,
          createTransferRule: true,
          createAllocationFactory: true,
        },
        choice: 'RegistrarServiceRequest_Accept',
        choiceArgument: { providerConfigurationCid: 'cfg-1', credentialCids: [] },
      },
    });
  });

  it('accepts a pending registrar request', () => {
    expect(acceptRegistrarServiceRequest('req-1', 'cfg-1')).toEqual({
      ExerciseCommand: {
        templateId: DA_REGISTRY_TEMPLATES.registrarServiceRequest,
        contractId: 'req-1',
        choice: 'RegistrarServiceRequest_Accept',
        choiceArgument: { providerConfigurationCid: 'cfg-1', credentialCids: [] },
      },
    });
  });

  it('deletes a rejected registrar request and creates the rule and factory', () => {
    expect(deleteRejectedRegistrarServiceRequest('rej-1')).toEqual({
      ExerciseCommand: {
        templateId: DA_REGISTRY_TEMPLATES.rejectedRegistrarServiceRequest,
        contractId: 'rej-1',
        choice: 'RejectedRegistrarServiceRequest_Delete',
        choiceArgument: {},
      },
    });
    expect(createTransferRule('svc-1')).toEqual({
      ExerciseCommand: {
        templateId: DA_REGISTRY_TEMPLATES.registrarService,
        contractId: 'svc-1',
        choice: 'RegistrarService_CreateTransferRule',
        choiceArgument: {},
      },
    });
    expect(createAllocationFactory('svc-1')).toEqual({
      ExerciseCommand: {
        templateId: DA_REGISTRY_TEMPLATES.registrarService,
        contractId: 'svc-1',
        choice: 'RegistrarService_CreateAllocationFactory',
        choiceArgument: {},
      },
    });
  });
});

describe('instrument configuration commands', () => {
  const payload = {
    instrumentId: 'CNTN',
    additionalIdentifiers: [] as [],
    issuerRequirements: [{ issuer: OTA, requiredClaims: [{ _1: 'canRedeem', _2: 'CNTN' }] }],
    holderRequirements: [{ issuer: OTA, requiredClaims: [{ _1: 'canTransfer', _2: 'CNTN' }] }],
    useBlockList: false,
  };

  it('creates, replaces and archives instrument configurations', () => {
    expect(createInstrumentConfiguration('svc-1', payload)).toEqual({
      ExerciseCommand: {
        templateId: DA_REGISTRY_TEMPLATES.registrarService,
        contractId: 'svc-1',
        choice: 'RegistrarService_CreateInstrumentConfiguration',
        choiceArgument: payload,
      },
    });
    expect(archiveAndCreateInstrumentConfiguration('svc-1', 'cfg-1', payload)).toEqual({
      ExerciseCommand: {
        templateId: DA_REGISTRY_TEMPLATES.registrarService,
        contractId: 'svc-1',
        choice: 'RegistrarService_ArchiveAndCreateInstrumentConfiguration',
        choiceArgument: { cid: 'cfg-1', payload },
      },
    });
    expect(archiveInstrumentConfiguration('svc-1', 'cfg-1')).toEqual({
      ExerciseCommand: {
        templateId: DA_REGISTRY_TEMPLATES.registrarService,
        contractId: 'svc-1',
        choice: 'RegistrarService_ArchiveInstrumentConfiguration',
        choiceArgument: { cid: 'cfg-1' },
      },
    });
  });
});

describe('credential commands', () => {
  it('builds an issuer-held credential with the operator as the only observer', () => {
    const payload = issuerHeldCredential({
      registrar: OTA,
      operator: OPERATOR,
      subject: 'alice::1220cc',
      claims: [
        { property: 'canTransfer', value: 'CNTN' },
        { property: 'canRedeem', value: 'CNTN' },
      ],
      id: 'CNTN allowlist',
      description: 'Approved holder',
      validUntil: '2027-04-30T00:00:00Z',
    });

    expect(payload.issuer).toBe(OTA);
    expect(payload.holder).toBe(OTA);
    expect(payload.validFrom).toBeNull();
    expect(payload.claims).toEqual([
      { subject: 'alice::1220cc', property: 'canTransfer', value: 'CNTN' },
      { subject: 'alice::1220cc', property: 'canRedeem', value: 'CNTN' },
    ]);
    expect(payload.observers).toEqual({ map: [[OPERATOR, {}]] });

    expect(createCredential(payload)).toEqual({
      CreateCommand: { templateId: DA_REGISTRY_TEMPLATES.credential, createArguments: { ...payload } },
    });
  });

  it('archives any registry contract by template key', () => {
    expect(archiveDaRegistryContract('credential', 'cid-1')).toEqual({
      ExerciseCommand: {
        templateId: DA_REGISTRY_TEMPLATES.credential,
        contractId: 'cid-1',
        choice: 'Archive',
        choiceArgument: {},
      },
    });
  });
});

describe('transfer preapprovals', () => {
  it('creates a preapproval with one allowance per instrument id', () => {
    expect(createTransferPreapproval(OPERATOR, 'alice::1220cc', OTA, ['CNTN', 'OTHER'])).toEqual({
      CreateCommand: {
        templateId: DA_REGISTRY_TEMPLATES.transferPreapproval,
        createArguments: {
          operator: OPERATOR,
          receiver: 'alice::1220cc',
          instrumentAdmin: OTA,
          instrumentAllowances: [{ id: 'CNTN' }, { id: 'OTHER' }],
        },
      },
    });
  });
});

describe('mint commands', () => {
  const context = mintChoiceContext('cfg-1', ['cred-1', 'cred-2']);
  const mint = {
    instrumentId: { admin: OTA, id: 'CNTN' },
    amount: '10000',
    holder: OTA,
    reference: 'da-registry-setup devnet: supply to 1000000',
    requestedAt: '2026-10-26T00:00:00Z',
    executeBefore: '2026-10-29T00:00:00Z',
    meta: { values: {} },
  };

  it('builds the mint context with the configuration and issuer credentials', () => {
    expect(context).toEqual({
      values: {
        [DA_REGISTRY_CONTEXT_KEYS.instrumentConfiguration]: { tag: 'AV_ContractId', value: 'cfg-1' },
        [DA_REGISTRY_CONTEXT_KEYS.issuerCredentials]: {
          tag: 'AV_List',
          value: [
            { tag: 'AV_ContractId', value: 'cred-1' },
            { tag: 'AV_ContractId', value: 'cred-2' },
          ],
        },
      },
    });
  });

  it('offers, accepts and cancels mints', () => {
    expect(offerMint('factory-1', OTA, mint, context)).toEqual({
      ExerciseCommand: {
        templateId: DA_REGISTRY_TEMPLATES.allocationFactory,
        contractId: 'factory-1',
        choice: 'AllocationFactory_OfferMint',
        choiceArgument: { expectedAdmin: OTA, mint, extraArgs: { context, meta: { values: {} } } },
      },
    });
    expect(acceptMintOffer('offer-1', context)).toEqual({
      ExerciseCommand: {
        templateId: DA_REGISTRY_TEMPLATES.mintOffer,
        contractId: 'offer-1',
        choice: 'MintOffer_Accept',
        choiceArgument: { extraArgs: { context, meta: { values: {} } } },
      },
    });
    expect(cancelMintOffer('offer-1')).toEqual({
      ExerciseCommand: {
        templateId: DA_REGISTRY_TEMPLATES.mintOffer,
        contractId: 'offer-1',
        choice: 'MintOffer_Cancel',
        choiceArgument: { extraArgs: null },
      },
    });
  });
});

describe('transferViaFactory', () => {
  it('exercises TransferFactory_Transfer on the token-standard interface with the given context', () => {
    const context = { values: { someKey: { tag: 'AV_ContractId', value: 'cid-1' } } };
    const command = transferViaFactory(
      'factory-1',
      OTA,
      {
        sender: OTA,
        receiver: 'alice::1220cc',
        amount: '500.25',
        instrumentId: { admin: OTA, id: 'CNTN' },
        requestedAt: '2026-10-26T00:00:00Z',
        executeBefore: '2026-10-26T01:00:00Z',
        inputHoldingCids: ['holding-1'],
        meta: { values: { 'splice.lfdecentralizedtrust.org/reason': 'seed delivery' } },
      },
      context
    );

    const ex = exercise(command);
    expect(ex.templateId).toBe(TOKEN_STANDARD_V1_TRANSFER_FACTORY_INTERFACE_ID);
    expect(ex.contractId).toBe('factory-1');
    expect(ex.choice).toBe('TransferFactory_Transfer');
    const arg = ex.choiceArgument;
    expect(arg['expectedAdmin']).toBe(OTA);
    expect(arg['extraArgs']).toEqual({ context, meta: { values: {} } });
    const transfer = arg['transfer'] as Record<string, unknown>;
    expect(transfer['sender']).toBe(OTA);
    expect(transfer['receiver']).toBe('alice::1220cc');
    expect(transfer['amount']).toBe('500.25');
    expect(transfer['inputHoldingCids']).toEqual(['holding-1']);
  });

  it('rejects an invalid amount instead of submitting it', () => {
    expect(() =>
      transferViaFactory(
        'factory-1',
        OTA,
        {
          sender: OTA,
          receiver: 'alice::1220cc',
          amount: 'not-a-number',
          instrumentId: { admin: OTA, id: 'CNTN' },
          requestedAt: '2026-10-26T00:00:00Z',
          executeBefore: '2026-10-26T01:00:00Z',
          inputHoldingCids: ['holding-1'],
        },
        { values: {} }
      )
    ).toThrow(/amount/);
  });
});
