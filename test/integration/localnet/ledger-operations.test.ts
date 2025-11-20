import { testClients } from '../../setup';

describe('LocalNet Ledger Operations', () => {
  describe('getLedgerEnd', () => {
    it('retrieves the current ledger end offset', async () => {
      const response = await testClients.ledgerJsonApi.getLedgerEnd();

      // Verify response has the expected structure
      expect(response).toHaveProperty('offset');
      expect(response.offset).toHaveProperty('value');
      expect(response.offset.value).toHaveProperty('absolute');
      
      // Offset should be a non-empty string
      expect(typeof response.offset.value.absolute).toBe('string');
      expect(response.offset.value.absolute.length).toBeGreaterThan(0);
    });
  });

  describe('createUser and getUser', () => {
    it('creates a user and retrieves it', async () => {
      // Generate a unique user ID to avoid conflicts
      const userId = `test-user-${Date.now()}`;

      // Create the user
      const createResponse = await testClients.ledgerJsonApi.createUser({
        user: {
          id: userId,
          isDeactivated: false,
        },
      });

      // Verify user was created with correct properties
      expect(createResponse.user).toEqual({
        id: userId,
        isDeactivated: false,
      });

      // Retrieve the user to verify it was persisted
      const getResponse = await testClients.ledgerJsonApi.getUser({
        userId,
      });

      // Verify retrieved user matches what we created
      expect(getResponse.user).toMatchObject({
        id: userId,
        isDeactivated: false,
      });

      // User should have metadata with resource version
      expect(getResponse.user).toHaveProperty('metadata');
      expect(getResponse.user.metadata).toHaveProperty('resourceVersion');
    });
  });
});
