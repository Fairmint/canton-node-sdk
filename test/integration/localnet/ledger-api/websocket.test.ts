/**
 * LedgerJsonApiClient integration tests: WebSocket Subscriptions
 *
 * Tests for WebSocket-based streaming subscriptions.
 */

import { getClient } from './setup';

describe('LedgerJsonApiClient / WebSocket', () => {
  let partyId: string;

  beforeAll(async () => {
    const client = getClient();
    const parties = await client.listParties({});
    const partyDetails = parties.partyDetails ?? [];

    if (partyDetails.length > 0 && partyDetails[0]) {
      partyId = partyDetails[0].party;
    }
  });

  test('subscribeToUpdates establishes connection with bounded range', async () => {
    // Fail if we don't have a party - this is required for the test
    expect(partyId).toBeDefined();

    const client = getClient();

    // Get ledger end to determine a valid range
    const ledgerEnd = await client.getLedgerEnd({});
    expect(ledgerEnd.offset).toBeDefined();

    // Use a bounded subscription (with endInclusive) so it completes
    const messages: unknown[] = [];

    await client.subscribeToUpdates({
      parties: [partyId],
      beginExclusive: 0,
      endInclusive: Math.min(ledgerEnd.offset ?? 0, 10),
      onMessage: (msg) => {
        messages.push(msg);
      },
    });

    // Subscription completed normally
    expect(messages).toBeDefined();
  }, 15000);

  test('subscribeToCompletions can be established and closed', async () => {
    expect(partyId).toBeDefined();

    const client = getClient();

    const authUser = await client.getAuthenticatedUser({});
    const { user } = authUser;
    expect(user.id).toBeDefined();

    const subscription = await client.subscribeToCompletions(
      {
        userId: user.id,
        parties: [partyId],
      },
      {
        onMessage: () => {},
        onError: () => {},
        onClose: () => {},
      }
    );

    expect(subscription).toBeDefined();
    expect(typeof subscription.close).toBe('function');
    subscription.close();
  }, 15000);
});
