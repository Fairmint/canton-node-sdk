import { CreatedEventDetailsSchema } from '../../../src/clients/ledger-json-api/schemas/api/event-details';

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
