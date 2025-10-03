import 'dotenv/config';
import { LedgerJsonApiClient } from '../../src';

async function main(): Promise<void> {
  const client = new LedgerJsonApiClient();
  const ledgerEndResp = await client.getLedgerEnd({});
  const beginExclusive = ledgerEndResp.offset - 1000;

  const partyId = client.getPartyId();

  const subscription = await client.subscribeToFlats(
    {
      beginExclusive,
      updateFormat: {
        includeTransactions: {
          eventFormat: {
            filtersByParty: {
              [partyId]: {
                cumulative: [
                  {
                    identifierFilter: {
                      WildcardFilter: { includeCreatedEventBlob: true },
                    },
                  },
                ],
              },
            },
            verbose: false,
          },
          transactionShape: 'TRANSACTION_SHAPE_ACS_DELTA',
        },
      },
    },
    {
      onOpen: () => {},
      onMessage: (msg) => {
        console.log('Update:', msg);
      },
      onError: (err) => {
        console.error('Subscription error:', err);
        process.exit(1);
      },
      onClose: (code, reason) => {
        console.log(`Connection closed: ${code} - ${reason}`);
      },
    }
  );

  // Keep open for demo
  setTimeout(() => {
    subscription.close();
    console.log('Subscription closed after timeout');
    process.exit(0);
  }, 120000);
}

main().catch((err) => {
  console.error('Main error:', err);
  process.exit(1);
});
