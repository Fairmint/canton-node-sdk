import { RightKindSchema, RightSchema } from '../../../src/clients/ledger-json-api/schemas/api/users';
import {
  CreateUserParamsSchema,
  GrantUserRightsParamsSchema,
  RevokeUserRightsParamsSchema,
} from '../../../src/clients/ledger-json-api/schemas/operations/users';

const PARTY = 'alice::1220aa';

/** Every right kind in the JSON Ledger API's value-wrapped shape. */
const wrappedKinds = [
  { CanActAs: { value: { party: PARTY } } },
  { CanReadAs: { value: { party: PARTY } } },
  { CanReadAsAnyParty: { value: {} } },
  { CanExecuteAs: { value: { party: PARTY } } },
  { CanExecuteAsAnyParty: { value: {} } },
  { Empty: { value: {} } },
  { IdentityProviderAdmin: { value: {} } },
  { ParticipantAdmin: { value: {} } },
];

/** The older unwrapped shapes, which `RightKindSchema` still accepts. */
const bareKinds = [
  { CanActAs: { party: PARTY } },
  { CanReadAs: { party: PARTY } },
  { CanReadAsAnyParty: {} },
  { CanExecuteAs: { party: PARTY } },
  { CanExecuteAsAnyParty: {} },
  { Empty: {} },
  { IdentityProviderAdmin: {} },
  { ParticipantAdmin: {} },
];

describe('RightKindSchema', () => {
  it.each(wrappedKinds)('keeps the value wrapper of %j', (kind) => {
    expect(RightKindSchema.parse(kind)).toStrictEqual(kind);
  });

  it.each(bareKinds)('still accepts the unwrapped shape %j', (kind) => {
    expect(RightKindSchema.parse(kind)).toStrictEqual(kind);
  });

  it('keeps the value wrapper of a right in a response', () => {
    const right = { kind: { ParticipantAdmin: { value: {} } } };

    expect(RightSchema.parse(right)).toStrictEqual(right);
  });

  it('rejects a party right without a party', () => {
    expect(RightKindSchema.safeParse({ CanActAs: { value: {} } }).success).toBe(false);
  });
});

describe('user right request schemas', () => {
  const user = { id: 'user-id', isDeactivated: false };

  it.each(wrappedKinds)('create, grant and revoke keep %j unchanged', (kind) => {
    const rights = [{ kind }];

    expect(CreateUserParamsSchema.parse({ user, rights }).rights).toStrictEqual(rights);
    expect(GrantUserRightsParamsSchema.parse({ userId: user.id, rights }).rights).toStrictEqual(rights);
    expect(RevokeUserRightsParamsSchema.parse({ userId: user.id, rights }).rights).toStrictEqual(rights);
  });
});
