import { testClients } from '../../setup';

describe('LocalNet CreateUser and GetUser', () => {
  it('createUser and getUser', async () => {
    const userId = `test-user-${Date.now()}`;

    // Write: Create a user
    const createResponse = await testClients.ledgerJsonApi.createUser({
      user: {
        id: userId,
        isDeactivated: false,
      },
    });

    expect(createResponse).toHaveProperty('user');
    expect(createResponse.user).toHaveProperty('id');
    expect(createResponse.user.id).toBe(userId);

    // Read: Get the user to demonstrate the impact
    const getUserResponse = await testClients.ledgerJsonApi.getUser({
      userId: userId,
    });

    expect(getUserResponse).toHaveProperty('user');
    expect(getUserResponse.user).toHaveProperty('id');
    expect(getUserResponse.user.id).toBe(userId);
    expect(getUserResponse.user.isDeactivated).toBe(false);
  });
});
