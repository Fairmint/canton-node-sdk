import 'dotenv/config';
import { LedgerJsonApiClient } from '../../src';

async function main(): Promise<void> {
  const client = new LedgerJsonApiClient();
  const ledgerEndResp = await client.getLedgerEnd({});
  const beginExclusive = ledgerEndResp.offset - 1000;

  const partyId = client.getPartyId();

  const subscription = await client.subscribeToTrees(
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
      onOpen: () => console.log('Updates stream opened'),
      onMessage: msg => console.log(JSON.stringify(msg)),
      onError: err => {
        console.error('Stream error:', err);
        process.exit(1);
      },
      onClose: (code, reason) =>
        console.log(`Stream closed: ${code} ${reason}`),
    }
  );

  // Keep open for demo
  setTimeout(() => {
    subscription.close();
    console.log('Closed subscription (demo)');
    process.exit(0);
  }, 120000);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
