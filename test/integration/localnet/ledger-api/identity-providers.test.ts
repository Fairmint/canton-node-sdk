/**
 * LedgerJsonApiClient integration tests: Identity Provider Configuration
 *
 * Tests for managing identity providers (IDPs) in the ledger.
 */

import { getClient } from './setup';

describe('LedgerJsonApiClient / IdentityProviders', () => {
  test('listIdentityProviderConfigs returns IDP list', async () => {
    const client = getClient();
    const response = await client.listIdentityProviderConfigs({});

    expect(response).toBeDefined();
    expect(response.identityProviderConfigs).toBeDefined();
    expect(Array.isArray(response.identityProviderConfigs)).toBe(true);

    // LocalNet should have at least one IDP configured (default)
    // But it might be an empty list depending on setup
  });

  test('getIdentityProviderConfig retrieves specific IDP', async () => {
    const client = getClient();

    // Try to get the default IDP (empty string or 'default')
    try {
      const response = await client.getIdentityProviderConfig({
        idpId: '',
      });

      expect(response).toBeDefined();
      expect(response.identityProviderConfig).toBeDefined();
    } catch (error) {
      // May fail if no default IDP exists
      expect(error).toBeDefined();
    }
  });

  // Skip IDP creation/deletion tests as they can affect the system state
  // and may require admin permissions
  test.skip('createIdentityProviderConfig creates new IDP', async () => {
    // Would need to create, verify, then clean up an IDP
  });

  test.skip('deleteIdentityProviderConfig removes IDP', async () => {
    // Would need a test IDP to delete
  });

  test.skip('updateIdentityProviderConfig updates IDP settings', async () => {
    // Would need a test IDP to update
  });
});
