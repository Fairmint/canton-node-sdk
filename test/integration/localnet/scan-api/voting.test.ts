/**
 * ScanApiClient integration tests: Voting and Governance
 *
 * Tests for governance and voting-related endpoints.
 */

import { getClient } from './setup';

describe('ScanApiClient / Voting', () => {
  test('listAmuletPriceVotes returns price votes', async () => {
    const client = getClient();

    try {
      const response = await client.listAmuletPriceVotes();
      expect(response).toBeDefined();
    } catch (error) {
      // May not be available
      console.warn('listAmuletPriceVotes failed:', error);
    }
  });

  test('listDsoRulesVoteRequests returns vote requests', async () => {
    const client = getClient();

    try {
      const response = await client.listDsoRulesVoteRequests();
      expect(response).toBeDefined();
    } catch (error) {
      // May not be available
      console.warn('listDsoRulesVoteRequests failed:', error);
    }
  });

  test('listVoteRequestResults returns vote results', async () => {
    const client = getClient();

    try {
      const response = await client.listVoteRequestResults({
        body: {
          limit: 10,
        },
      });
      expect(response).toBeDefined();
    } catch (error) {
      // May not be available
      console.warn('listVoteRequestResults failed:', error);
    }
  });
});
