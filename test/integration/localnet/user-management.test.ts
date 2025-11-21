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

    expect(createResponse).toEqual({
      user: {
        id: userId,
        isDeactivated: false,
      },
    });

    const getResponse = await testClients.ledgerJsonApi.getUser({
      userId,
    });

    expect(getResponse).toEqual({
      user: {
        id: userId,
        isDeactivated: false,
      },
    });

    const listResponse = await testClients.ledgerJsonApi.listUsers({});

    expect(listResponse).toEqual({
      users: expect.arrayContaining([
        {
          id: userId,
          isDeactivated: false,
        },
      ]),
    });
  });
});
