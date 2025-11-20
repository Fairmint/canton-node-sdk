import { testClients } from '../../setup';

describe('LocalNet User Management', () => {
  it('should create a user, retrieve it, and list users', async () => {
    const userId = `test-user-${Date.now()}`;

    const createResponse = await testClients.ledgerJsonApi.createUser({
      user: {
        id: userId,
        isDeactivated: false,
      },
    });

    expect(createResponse.user).toBeDefined();
    expect(createResponse.user?.id).toBe(userId);
    expect(createResponse.user?.isDeactivated).toBe(false);

    const getResponse = await testClients.ledgerJsonApi.getUser({
      userId,
    });

    expect(getResponse.user).toBeDefined();
    expect(getResponse.user?.id).toBe(userId);
    expect(getResponse.user?.isDeactivated).toBe(false);

    const listResponse = await testClients.ledgerJsonApi.listUsers({});

    expect(listResponse.users).toBeDefined();
    expect(Array.isArray(listResponse.users)).toBe(true);
    const foundUser = listResponse.users?.find((user) => user.id === userId);
    expect(foundUser).toBeDefined();
    expect(foundUser?.id).toBe(userId);
  });
});
