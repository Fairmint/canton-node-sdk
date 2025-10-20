import 'dotenv/config';
import { LedgerJsonApiClient } from '../../src';

async function main(): Promise<void> {
  const client = new LedgerJsonApiClient();

  // Get the current ledger end offset
  const ledgerEndResp = await client.getLedgerEnd({});
  const beginExclusive = ledgerEndResp.offset - 1000;

  // Subscribe to updates with the simplified API
  // The parties and templateIds parameters make filtering much easier
  await client
    .subscribeToUpdates({
      beginExclusive,
      includeCreatedEventBlob: true,
      includeReassignments: true, // Include reassignment events (default: true)
      includeTopologyEvents: false, // Include topology events (default: false)
      // parties: ['alice::party1', 'bob::party2'], // Optional: specify specific parties
      // templateIds: ['Module:Template'], // Optional: filter by template IDs
      onMessage: (msg) => {
        console.log('Update:', msg);
      },
    })
    .catch((err) => {
      console.error('Subscription error:', err);
      process.exit(1);
    });

  console.log('Subscribed to updates. Press Ctrl+C to exit.');

  // Keep the process running
  process.on('SIGINT', () => {
    console.log('Shutting down...');
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('Main error:', err);
  process.exit(1);
});
