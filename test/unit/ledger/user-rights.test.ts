import {
  MissingUserRightError,
  assertCanReadAsAnyParty,
  getAuthenticatedUserRights,
} from '../../../src/utils/ledger/user-rights';

function ledger(
  rights: unknown[],
  userId = 'canton-ops'
): {
  getAuthenticatedUser: jest.Mock;
  listUserRights: jest.Mock;
} {
  return {
    getAuthenticatedUser: jest.fn().mockResolvedValue({ user: { id: userId, isDeactivated: false } }),
    listUserRights: jest.fn().mockResolvedValue({ rights }),
  };
}

describe('getAuthenticatedUserRights', () => {
  it("reads the token's user and lists its rights in readable form", async () => {
    const client = ledger([
      { kind: { CanReadAsAnyParty: { value: {} } } },
      { kind: { CanActAs: { value: { party: 'Alice::1' } } } },
      { kind: { CanReadAs: { party: 'Bob::1' } } },
      { kind: { ParticipantAdmin: { value: {} } } },
    ]);

    await expect(getAuthenticatedUserRights(client as never)).resolves.toEqual({
      userId: 'canton-ops',
      rights: expect.any(Array),
      rightNames: ['CanReadAsAnyParty', 'CanActAs(Alice::1)', 'CanReadAs(Bob::1)', 'ParticipantAdmin'],
      canReadAsAnyParty: true,
    });
    expect(client.listUserRights).toHaveBeenCalledWith({ userId: 'canton-ops' });
  });

  it('fails when the participant does not return the user', async () => {
    const client = ledger([]);
    client.getAuthenticatedUser.mockResolvedValue({});

    await expect(getAuthenticatedUserRights(client as never)).rejects.toThrow(
      'The ledger did not return the authenticated user'
    );
  });
});

describe('assertCanReadAsAnyParty', () => {
  it('returns the user and rights when CanReadAsAnyParty is granted', async () => {
    await expect(
      assertCanReadAsAnyParty(ledger([{ kind: { CanReadAsAnyParty: { value: {} } } }]) as never)
    ).resolves.toMatchObject({ userId: 'canton-ops', canReadAsAnyParty: true });
  });

  it('throws a MissingUserRightError naming the user and the rights it found', async () => {
    const client = ledger([
      { kind: { CanReadAs: { value: { party: 'Alice::1' } } } },
      { kind: { CanExecuteAsAnyParty: { value: {} } } },
    ]);

    const error = await assertCanReadAsAnyParty(client as never).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(MissingUserRightError);
    expect(error).toMatchObject({
      code: 'MISSING_USER_RIGHT',
      userId: 'canton-ops',
      requiredRight: 'CanReadAsAnyParty',
      rights: ['CanReadAs(Alice::1)', 'CanExecuteAsAnyParty'],
    });
    expect((error as Error).message).toBe(
      'Ledger user "canton-ops" does not hold the CanReadAsAnyParty right; its rights are: CanReadAs(Alice::1), ' +
        'CanExecuteAsAnyParty'
    );
  });

  it('says so when the user has no rights at all', async () => {
    await expect(assertCanReadAsAnyParty(ledger([]) as never)).rejects.toThrow('its rights are: (none)');
  });
});
