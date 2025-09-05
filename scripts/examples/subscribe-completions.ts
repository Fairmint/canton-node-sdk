import 'dotenv/config';
import { LedgerJsonApiClient } from '../../src';

async function main(): Promise<void> {
  const client = new LedgerJsonApiClient();
  const ledgerEndResp = await client.getLedgerEnd({});
  const beginExclusive = ledgerEndResp.offset - 1000;

  const parties = client.buildPartyList();

  const subscription = await client.subscribeToCompletions(
    {
      beginExclusive,
      parties,
      userId: '5',
    },
    {
      onOpen: () => console.log('Completions stream opened'),
      onMessage: (msg) => console.log(JSON.stringify(msg)),
      onError: (err) => {
        console.error('Stream error:', err);
        process.exit(1);
      },
      onClose: (code, reason) => console.log(`Stream closed: ${code} ${reason}`),
    }
  );

  // Keep open for demo
  setTimeout(() => {
    subscription.close();
    console.log('Closed subscription (demo)');
    process.exit(0);
  }, 120000);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


