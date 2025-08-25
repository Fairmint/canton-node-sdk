import 'dotenv/config';
import { LedgerJsonApiClient } from '../src';

async function main(): Promise<void> {
  const client = new LedgerJsonApiClient();

  const subscription = await client.subscribeToActiveContracts(
    { activeAtOffset: 0 },
    {
      onOpen: () => console.log('Active contracts stream opened'),
      onMessage: msg => console.log(JSON.stringify(msg)),
      onError: err => {
        console.error('Stream error:', err);
        process.exit(1);
      },
      onClose: (code, reason) =>
        console.log(`Stream closed: ${code} ${reason}`),
    }
  );

  // Close after 15 seconds for demo purposes
  setTimeout(() => {
    subscription.close();
    console.log('Closed subscription (demo)');
  }, 15000);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
