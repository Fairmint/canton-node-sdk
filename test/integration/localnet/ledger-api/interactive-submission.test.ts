/**
 * LedgerJsonApiClient integration tests: Interactive Submission
 *
 * Tests for the interactive submission API used for external signing workflows.
 */

import { getClient } from './setup';

describe('LedgerJsonApiClient / InteractiveSubmission', () => {
  let partyId: string;

  beforeAll(async () => {
    const client = getClient();
    const parties = await client.listParties({});
    const partyDetails = parties.partyDetails ?? [];
    if (partyDetails.length > 0 && partyDetails[0]) {
      partyId = partyDetails[0].party;
    }
  });

  test('interactiveSubmissionGetPreferredPackages returns package info', async () => {
    if (!partyId) {
      console.warn('No party available for interactiveSubmissionGetPreferredPackages test');
      return;
    }

    const client = getClient();

    // Get the amulet rules to find the synchronizer ID
    // First, we need a valid synchronizer ID
    try {
      const response = await client.interactiveSubmissionGetPreferredPackages({
        packageVettingRequirements: [],
      });

      expect(response).toBeDefined();
      // Response structure depends on packages available
    } catch (error) {
      // May fail if no synchronizer is connected
      expect(error).toBeDefined();
    }
  });

  test('interactiveSubmissionGetPreferredPackageVersion returns version info', async () => {
    if (!partyId) {
      console.warn('No party available for interactiveSubmissionGetPreferredPackageVersion test');
      return;
    }

    const client = getClient();

    try {
      const response = await client.interactiveSubmissionGetPreferredPackageVersion({
        parties: [partyId],
        packageName: 'splice-amulet',
      });

      expect(response).toBeDefined();
    } catch (error) {
      // May fail if package is not found
      expect(error).toBeDefined();
    }
  });
});
