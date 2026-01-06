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
    expect(partyId).toBeDefined();

    const client = getClient();

    const response = await client.interactiveSubmissionGetPreferredPackages({
      packageVettingRequirements: [],
    });

    expect(response).toBeDefined();
  });

  test('interactiveSubmissionGetPreferredPackageVersion returns error for unknown package', async () => {
    expect(partyId).toBeDefined();

    const client = getClient();

    // Unknown package name should return error
    await expect(
      client.interactiveSubmissionGetPreferredPackageVersion({
        parties: [partyId],
        packageName: 'non-existent-package',
      })
    ).rejects.toThrow();
  });
});
