import { CreatedEventDetailsSchema } from '../../../src/clients/ledger-json-api/schemas/api/event-details';
import { JsInterfaceViewSchema } from '../../../src/clients/ledger-json-api/schemas/api/interface-view';
import { JsGetActiveContractsResponseItemSchema } from '../../../src/clients/ledger-json-api/schemas/api/state';

const ASSET_INTERFACE = '#example-package:Example.Module:Asset';

const FAILED_VIEW_WIRE = {
  interfaceId: ASSET_INTERFACE,
  viewStatus: { code: 9, message: 'view failed', details: [] },
  viewValue: null,
  implementationPackageId: null,
};

describe('CreatedEventDetailsSchema interface views', () => {
  it('parses an interface view returned by the Ledger JSON API', () => {
    const result = CreatedEventDetailsSchema.parse({
      offset: 42,
      nodeId: 0,
      contractId: 'contract-1',
      templateId: '#amulet:Splice.Amulet:Amulet',
      contractKey: null,
      createArgument: { owner: 'Alice' },
      createdEventBlob: '',
      interfaceViews: [
        {
          interfaceId: '#token-standard:Splice.Api.Token.HoldingV1:Holding',
          implementationPackageId: 'implementation-package-id',
          viewStatus: {
            code: 0,
            message: '',
            details: [],
          },
          viewValue: {
            amount: '1000.0000000000',
            instrumentId: { admin: 'DSO', id: 'Amulet' },
          },
        },
      ],
      witnessParties: ['Alice'],
      signatories: ['Alice'],
      observers: [],
      createdAt: '2026-07-09T00:00:00Z',
      packageName: 'splice-amulet',
    });

    expect(result.interfaceViews[0]).toEqual({
      interfaceId: '#token-standard:Splice.Api.Token.HoldingV1:Holding',
      implementationPackageId: 'implementation-package-id',
      viewStatus: { code: 0, message: '', details: [] },
      viewValue: {
        amount: '1000.0000000000',
        instrumentId: { admin: 'DSO', id: 'Amulet' },
      },
    });
  });
});

describe('JsInterfaceViewSchema', () => {
  it('omits a null implementationPackageId on a successful view', () => {
    const result = JsInterfaceViewSchema.parse({
      interfaceId: ASSET_INTERFACE,
      implementationPackageId: null,
      viewStatus: { code: 0, message: '', details: [] },
      viewValue: { cap_table_id: 'cap-table-1', object_type: 'STAKEHOLDER', object_id: 's-1', security_ids: [] },
    });

    expect(result).toEqual({
      interfaceId: ASSET_INTERFACE,
      viewStatus: { code: 0, message: '', details: [] },
      viewValue: { cap_table_id: 'cap-table-1', object_type: 'STAKEHOLDER', object_id: 's-1', security_ids: [] },
    });
    expect(result).not.toHaveProperty('implementationPackageId');
  });

  it('parses a failed view with null viewValue and implementationPackageId, omitting both', () => {
    const result = JsInterfaceViewSchema.parse(FAILED_VIEW_WIRE);

    expect(result).toEqual({
      interfaceId: ASSET_INTERFACE,
      viewStatus: { code: 9, message: 'view failed', details: [] },
    });
    expect(result).not.toHaveProperty('viewValue');
    expect(result).not.toHaveProperty('implementationPackageId');
  });

  it('parses a failed view whose viewValue and implementationPackageId are omitted', () => {
    const result = JsInterfaceViewSchema.parse({
      interfaceId: ASSET_INTERFACE,
      viewStatus: { code: 9, message: 'view failed', details: [] },
    });

    expect(result).toEqual({
      interfaceId: ASSET_INTERFACE,
      viewStatus: { code: 9, message: 'view failed', details: [] },
    });
  });

  it('still rejects an unknown key', () => {
    expect(
      JsInterfaceViewSchema.safeParse({
        ...FAILED_VIEW_WIRE,
        unexpected: true,
      }).success
    ).toBe(false);
  });

  it('parses an active-contract item whose created event carries a failed view', () => {
    const result = JsGetActiveContractsResponseItemSchema.parse({
      workflowId: '',
      contractEntry: {
        JsActiveContract: {
          createdEvent: {
            offset: 42,
            nodeId: 0,
            contractId: 'contract-1',
            templateId: '#example-package:Example.Module:Ledger',
            contractKey: null,
            createArgument: { issuer: 'Alice' },
            interfaceViews: [FAILED_VIEW_WIRE],
            witnessParties: ['Alice'],
            signatories: ['Alice'],
            observers: [],
            createdAt: '2026-10-22T00:00:00Z',
            packageName: 'example-package',
          },
          synchronizerId: 'global-domain::fingerprint',
          reassignmentCounter: 0,
        },
      },
    });

    const entry = result.contractEntry;
    if (!('JsActiveContract' in entry)) {
      throw new Error('expected JsActiveContract');
    }
    const [view] = entry.JsActiveContract.createdEvent.interfaceViews;
    expect(view).toEqual({
      interfaceId: ASSET_INTERFACE,
      viewStatus: { code: 9, message: 'view failed', details: [] },
    });
    expect(view).not.toHaveProperty('viewValue');
    expect(view).not.toHaveProperty('implementationPackageId');
  });
});
