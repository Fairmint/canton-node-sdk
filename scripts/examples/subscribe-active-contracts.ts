import 'dotenv/config';
import { LedgerJsonApiClient } from '../../src';

async function main(): Promise<void> {
  const client = new LedgerJsonApiClient();

  // Use the current ledger end as the snapshot point for active contracts
  const ledgerEndResp = await client.getLedgerEnd({});
  const activeAtOffset = ledgerEndResp.offset;

  const partyId = client.getPartyId();

  let activeContractsFound = 0;

  const subscription = await client.subscribeToActiveContracts(
    {
      activeAtOffset,
      parties: [partyId],
      verbose: false,
      // If you omit eventFormat, the client builds a default filtersByParty
      // using the provided parties (or the client's party list).
    },
    {
      onOpen: () => 
      onMessage: (msg) => {
        // Count only active contract entries
        if (
          typeof msg === 'object' &&
          msg !== null &&
          'contractEntry' in msg &&
          msg.contractEntry &&
          'JsActiveContract' in msg.contractEntry
        ) {
          activeContractsFound += 1;
        }
        
      },
      onError: (err) => {
        
        
        process.exit(1);
      },
      onClose: (code, reason) => {
        
        
        process.exit(0);
      },
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
