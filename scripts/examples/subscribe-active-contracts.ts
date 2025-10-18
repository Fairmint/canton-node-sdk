import 'dotenv/config';
import { LedgerJsonApiClient } from '../../src';

async function main(): Promise<void> {
  const client = new LedgerJsonApiClient();

  // Use the current ledger end as the snapshot point for active contracts
  const ledgerEndResp = await client.getLedgerEnd({});
  const activeAtOffset = ledgerEndResp.offset;

  const partyId = client.getPartyId();

  let activeContractsFound = 0;

  // New awaitable API with optional onItem streaming callback
  const results = await client.getActiveContracts({
    activeAtOffset,
    parties: [partyId],
    onItem: (msg) => {
      const entry = (msg as any)?.contractEntry;
      if (entry && typeof entry === 'object' && 'JsActiveContract' in entry) {
        activeContractsFound += 1;
      }
    },
  });

  console.log(`Active contracts found (via onItem): ${activeContractsFound}`);
  console.log(`Total results: ${Array.isArray(results) ? results.length : 0}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Main error:', err);
  process.exit(1);
});
