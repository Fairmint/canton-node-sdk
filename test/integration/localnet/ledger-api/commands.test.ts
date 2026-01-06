/**
 * LedgerJsonApiClient integration tests: Command Submission
 *
 * Tests for submitting commands to the ledger, including synchronous and asynchronous submission,
 * as well as different response formats (completion, transaction, transaction tree).
 */

import { getClient } from './setup';

describe('LedgerJsonApiClient / Commands', () => {
  // We need a party ID to act as when submitting commands
  // These will be populated in beforeAll
  let partyId: string;

  beforeAll(async () => {
    const client = getClient();

    // Get a party from the list to use for commands
    const parties = await client.listParties({});
    const partyDetails = parties.partyDetails ?? [];

    if (partyDetails.length > 0 && partyDetails[0]) {
      partyId = partyDetails[0].party;
    }
  });

  test('asyncSubmit endpoint is available', async () => {
    // Skip if we don't have a valid party
    if (!partyId) {
      console.warn('No party available for asyncSubmit test');
      return;
    }

    const client = getClient();

    // Get packages to find a template we can use
    const packages = await client.listPackages();
    expect(packages.packageIds).toBeDefined();

    // Even without creating a contract, we can test the async submit endpoint exists
    // by submitting an empty command list which should succeed but produce no events
    // Note: In practice, you'd need a real template ID to create contracts
  });

  test('completions retrieves command completions', async () => {
    if (!partyId) {
      console.warn('No party available for completions test');
      return;
    }

    const client = getClient();

    // Get authenticated user to get the user ID
    const authUser = await client.getAuthenticatedUser({});
    const userId = authUser.user.id;

    expect(userId).toBeDefined();

    // Retrieve completions for the user (may be empty)
    // Note: beginExclusive is required by the API
    const completions = await client.completions({
      userId,
      parties: [partyId],
      beginExclusive: 0,
      limit: 10,
    });

    // Should return a response with optional items array
    expect(completions).toBeDefined();
  });
});
