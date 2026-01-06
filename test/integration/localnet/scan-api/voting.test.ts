/**
 * ScanApiClient integration tests: Voting and Governance
 *
 * Tests for governance and voting-related endpoints.
 */

import { getClient } from './setup';

describe('ScanApiClient / Voting', () => {
  test('listAmuletPriceVotes returns price votes', async () => {
    const client = getClient();

    const response = await client.listAmuletPriceVotes();

    expect(response).toBeDefined();
  });

  test('listDsoRulesVoteRequests returns vote requests', async () => {
    const client = getClient();

    const response = await client.listDsoRulesVoteRequests();

    expect(response).toBeDefined();
  });

  test('listVoteRequestResults returns vote results', async () => {
    const client = getClient();

    const response = await client.listVoteRequestResults({
      body: {
        limit: 10,
      },
    });

    expect(response).toBeDefined();
  });
});
