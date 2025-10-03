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
      onOpen: () => 
      onMessage: (msg) => 
      onError: (err) => {
        
        process.exit(1);
      },
      onClose: (code, reason) => 
    }
  );

  // Keep open for demo
  setTimeout(() => {
    subscription.close();
    
    process.exit(0);
  }, 120000);
}

main().catch((err) => {
  
  process.exit(1);
});
