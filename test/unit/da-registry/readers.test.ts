import {
  credentialRequirement,
  DA_REGISTRAR_INTERNAL_SCHEME,
  daRegistryExtraArgs,
  mintChoiceContext,
  partySet,
  partySetMembers,
  readClaimTuple,
  readOptionalBool,
  readRequirements,
  sameRequirements,
} from '../../../src/da-registry';

describe('claim and requirement readers', () => {
  it('reads claims in ledger and REST encodings', () => {
    expect(readClaimTuple({ _1: 'canTransfer', _2: 'CNTN' })).toEqual({ property: 'canTransfer', value: 'CNTN' });
    expect(readClaimTuple({ property: 'canRedeem', value: 'CNTN' })).toEqual({ property: 'canRedeem', value: 'CNTN' });
  });

  it('builds a credential requirement as a Daml (Text, Text) list', () => {
    expect(credentialRequirement('ota::1220aa', { property: 'canTransfer', value: 'CNTN' })).toEqual({
      issuer: 'ota::1220aa',
      requiredClaims: [{ _1: 'canTransfer', _2: 'CNTN' }],
    });
  });

  it('reads requirement lists, defaulting junk to empty', () => {
    expect(readRequirements('junk')).toEqual([]);
    expect(
      readRequirements([
        { issuer: 'ota::1220aa', requiredClaims: [{ _1: 'canTransfer', _2: 'CNTN' }] },
        { issuer: 'other::1220bb' },
      ])
    ).toEqual([
      { issuer: 'ota::1220aa', claims: [{ property: 'canTransfer', value: 'CNTN' }] },
      { issuer: 'other::1220bb', claims: [] },
    ]);
  });

  it('compares requirement lists order-insensitively', () => {
    const a = [
      {
        issuer: 'x',
        claims: [
          { property: 'p1', value: 'v1' },
          { property: 'p2', value: 'v2' },
        ],
      },
      { issuer: 'y', claims: [] },
    ];
    const b = [
      { issuer: 'y', claims: [] },
      {
        issuer: 'x',
        claims: [
          { property: 'p2', value: 'v2' },
          { property: 'p1', value: 'v1' },
        ],
      },
    ];
    expect(sameRequirements(a, b)).toBe(true);
    expect(sameRequirements(a, [])).toBe(false);
    const mismatched = b[0];
    if (!mismatched) throw new Error('test setup');
    expect(sameRequirements(a, [{ issuer: 'x', claims: [{ property: 'p1', value: 'other' }] }, mismatched])).toBe(
      false
    );
  });

  it('distinguishes one claim containing a delimiter from two claims', () => {
    const oneClaim = [{ issuer: 'x', claims: [{ property: 'a', value: '1,b=2' }] }];
    const twoClaims = [
      {
        issuer: 'x',
        claims: [
          { property: 'a', value: '1' },
          { property: 'b', value: '2' },
        ],
      },
    ];
    expect(sameRequirements(oneClaim, twoClaims)).toBe(false);
  });

  it('reads Daml Optional Bool', () => {
    expect(readOptionalBool(true)).toBe(true);
    expect(readOptionalBool(false)).toBe(false);
    expect(readOptionalBool(null)).toBeNull();
    expect(readOptionalBool(undefined)).toBeNull();
    expect(readOptionalBool('true')).toBeNull();
  });
});

describe('party sets', () => {
  it('builds a sorted deduplicated Daml set', () => {
    expect(partySet(['b::1220bb', 'a::1220aa', 'b::1220bb'])).toEqual({
      map: [
        ['a::1220aa', {}],
        ['b::1220bb', {}],
      ],
    });
  });

  it('reads members back from the map encoding', () => {
    expect(
      partySetMembers({
        map: [
          ['a::1220aa', {}],
          ['b::1220bb', {}],
        ],
      })
    ).toEqual(['a::1220aa', 'b::1220bb']);
    expect(partySetMembers(null)).toEqual([]);
    expect(partySetMembers({ map: 'junk' })).toEqual([]);
  });
});

describe('choice contexts', () => {
  it('wraps a context in ExtraArgs with empty meta', () => {
    const context = { values: { k: 1 } };
    expect(daRegistryExtraArgs(context)).toEqual({ context, meta: { values: {} } });
  });

  it('builds a registrar mint context', () => {
    expect(mintChoiceContext('cfg-1', ['cred-1'])).toEqual({
      values: {
        'utility.digitalasset.com/instrument-configuration': { tag: 'AV_ContractId', value: 'cfg-1' },
        'utility.digitalasset.com/issuer-credentials': {
          tag: 'AV_List',
          value: [{ tag: 'AV_ContractId', value: 'cred-1' }],
        },
      },
    });
  });

  it('exposes the registrar-internal identifier scheme', () => {
    expect(DA_REGISTRAR_INTERNAL_SCHEME).toBe('RegistrarInternalScheme');
  });
});
