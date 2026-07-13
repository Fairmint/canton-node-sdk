import {
  LedgerContractIdSchema,
  LedgerCreatedEventSchema,
  LedgerInterfaceIdSchema,
  LedgerPackageIdSchema,
  LedgerPackageNameSchema,
  LedgerPartyIdSchema,
  LedgerTemplateIdSchema,
} from '../../../src/clients/ledger-json-api';

const CONTRACT_ID = `00${'ab'.repeat(32)}`;
const PARTY = 'validator::fingerprint';
const PACKAGE_ID = '12'.repeat(32);
const PROTO_VALUE_BASE64 = Buffer.from('encoded-protobuf').toString('base64');
const CONTRACT_KEY_HASH_BASE64 = Buffer.alloc(32, 1).toString('base64');

function createWireEvent(): Record<string, unknown> {
  return {
    offset: 1,
    nodeId: 0,
    contractId: CONTRACT_ID,
    templateId: `${PACKAGE_ID}:Splice.Wallet.Install:WalletAppInstall`,
    contractKey: null,
    contractKeyHash: '',
    createArgument: {
      validator: PARTY,
      nestedNull: null,
      values: [1, true, null],
    },
    createdEventBlob: '',
    interfaceViews: [],
    witnessParties: [PARTY],
    signatories: [PARTY],
    observers: [],
    createdAt: '2026-07-10T12:00:00.123456789Z',
    packageName: 'splice-wallet',
    representativePackageId: PACKAGE_ID,
    acsDelta: false,
  };
}

describe('strict Ledger CreatedEvent wire schema', () => {
  it('preserves shared interface-view status and lossless decoded JSON', () => {
    const wireEvent = createWireEvent();
    Object.assign(wireEvent, {
      interfaceViews: [
        {
          interfaceId: `${PACKAGE_ID}:Module:Interface`,
          viewStatus: {
            code: 0,
            message: '',
            details: [
              {
                typeUrl: 'type.googleapis.com/google.rpc.ErrorInfo',
                value: PROTO_VALUE_BASE64,
                unknownFields: { fields: {} },
                valueDecoded: { reason: 'TEST', metadata: { retryable: false, attempts: [1, null] } },
              },
            ],
          },
          viewValue: { owner: PARTY, nestedNull: null },
          implementationPackageId: null,
        },
      ],
    });

    const event = LedgerCreatedEventSchema.parse(wireEvent);

    expect(event.interfaceViews?.[0]).toEqual(
      expect.objectContaining({
        viewValue: { owner: PARTY, nestedNull: null },
        viewStatus: expect.objectContaining({ code: 0 }),
      })
    );
    expect(event.interfaceViews?.[0]).not.toHaveProperty('implementationPackageId');
  });

  it('uses contractKeyHash to distinguish an absent key from a present top-level-null key', () => {
    const withoutKey = LedgerCreatedEventSchema.parse(createWireEvent());
    const wireEventWithNullKey = createWireEvent();
    Object.assign(wireEventWithNullKey, {
      contractKey: null,
      contractKeyHash: CONTRACT_KEY_HASH_BASE64,
    });
    const withNullKey = LedgerCreatedEventSchema.parse(wireEventWithNullKey);

    expect(withoutKey).not.toHaveProperty('contractKey');
    expect(withNullKey).toHaveProperty('contractKey', null);
  });

  it('infers a top-level-null key from a non-empty hash when the wire key field is omitted', () => {
    const wireEvent = createWireEvent();
    delete wireEvent['contractKey'];
    Object.assign(wireEvent, { contractKeyHash: CONTRACT_KEY_HASH_BASE64 });

    expect(LedgerCreatedEventSchema.parse(wireEvent)).toHaveProperty('contractKey', null);
  });

  it('rejects a non-null key without its required hash', () => {
    const wireEvent = createWireEvent();
    Object.assign(wireEvent, { contractKey: { owner: PARTY }, contractKeyHash: '' });

    expect(() => LedgerCreatedEventSchema.parse(wireEvent)).toThrow('A present contract key requires');
  });

  it.each([1, 31, 33])('rejects a %i-byte contract-key hash', (byteLength) => {
    const wireEvent = createWireEvent();
    Object.assign(wireEvent, {
      contractKey: { owner: PARTY },
      contractKeyHash: Buffer.alloc(byteLength, 1).toString('base64'),
    });

    expect(() => LedgerCreatedEventSchema.parse(wireEvent)).toThrow('Expected a 32-byte contract-key hash');
  });
});

describe('pinned Ledger identifiers', () => {
  it.each([
    `00${'ab'.repeat(32)}`,
    `00${'ab'.repeat(32)}${'cd'.repeat(94)}`,
    `01${'ab'.repeat(12)}`,
    `01${'ab'.repeat(12)}${'cd'.repeat(33)}`,
  ])('accepts canonical contract ID %s', (contractId) => {
    expect(LedgerContractIdSchema.parse(contractId)).toBe(contractId);
  });

  it.each([
    '',
    '00contract-id',
    `00${'AB'.repeat(32)}`,
    `00${'ab'.repeat(31)}`,
    `00${'ab'.repeat(32)}a`,
    `00${'ab'.repeat(32)}${'cd'.repeat(95)}`,
    `01${'ab'.repeat(11)}`,
    `01${'ab'.repeat(12)}${'cd'.repeat(34)}`,
    `02${'ab'.repeat(32)}`,
  ])('rejects non-canonical contract ID %s', (contractId) => {
    expect(LedgerContractIdSchema.safeParse(contractId).success).toBe(false);
  });

  it.each(['Alice', 'validator::fingerprint', 'party with spaces', `p${'-_ :0'.repeat(42)}`])(
    'accepts canonical party %s',
    (party) => {
      expect(LedgerPartyIdSchema.parse(party)).toBe(party);
    }
  );

  it.each(['', 'bad.party', 'bad\nparty', '東京', 'p'.repeat(256)])('rejects invalid party %s', (party) => {
    expect(LedgerPartyIdSchema.safeParse(party).success).toBe(false);
  });

  it('validates and brands package, template, and interface identifiers', () => {
    expect(LedgerPackageIdSchema.parse(PACKAGE_ID)).toBe(PACKAGE_ID);
    expect(LedgerPackageNameSchema.parse('splice-wallet')).toBe('splice-wallet');
    expect(LedgerTemplateIdSchema.parse(`${PACKAGE_ID}:Splice.Wallet.Install:WalletAppInstall`)).toBe(
      `${PACKAGE_ID}:Splice.Wallet.Install:WalletAppInstall`
    );
    expect(LedgerInterfaceIdSchema.parse(`${PACKAGE_ID}:Splice.Api.Token:Transfer`)).toBe(
      `${PACKAGE_ID}:Splice.Api.Token:Transfer`
    );
  });

  it.each([
    'package:Module:Template',
    `${'AB'.repeat(32)}:Module:Template`,
    `${PACKAGE_ID}:.Module:Template`,
    `${PACKAGE_ID}:Module:bad-name`,
    `${PACKAGE_ID}:Module:Template:extra`,
  ])('rejects invalid package-ID-qualified identifier %s', (identifier) => {
    expect(LedgerTemplateIdSchema.safeParse(identifier).success).toBe(false);
  });
});
