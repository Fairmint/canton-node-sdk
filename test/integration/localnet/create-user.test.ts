import { testClients } from '../../setup';

describe('LocalNet CreateUser', () => {
  it('createUser and getUser', async () => {
    const userId = `test-user-${Date.now()}`;

    // Create a user
    const createResponse = await testClients.ledgerJsonApi.createUser({
      user: {
        id: userId,
        isDeactivated: false,
      },
    });

    expect(createResponse).toHaveProperty('user');
    expect(createResponse.user).toHaveProperty('id', userId);
    expect(createResponse.user).toHaveProperty('isDeactivated', false);

    // Read the user back to demonstrate the impact
    const getUserResponse = await testClients.ledgerJsonApi.getUser({
      userId,
    });

    expect(getUserResponse).toHaveProperty('user');
    expect(getUserResponse.user).toHaveProperty('id', userId);
    expect(getUserResponse.user).toHaveProperty('isDeactivated', false);
  });
});
