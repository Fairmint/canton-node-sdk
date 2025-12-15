#!/usr/bin/env tsx
/**
 * Example: Scan API - traffic status
 *
 * Demonstrates calling the public Scan API `traffic-status` endpoint with endpoint rotation.
 *
 * Usage:
 *   npx tsx examples/scan-traffic-status.ts --network devnet --provider "Cumberland-1" --domainId <domain_id> --partyId <party_id>
 *
 * Notes:
 * - The scan endpoints are public (no OAuth2).
 * - You can obtain the provider's partyId via the Ledger JSON API (e.g. `getParty()`), then use Scan to map it to a participant.
 */

import { ScanApiClient } from '../src';

function readArg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) {
    return undefined;
  }
  return process.argv[idx + 1];
}

async function main(): Promise<void> {
  const network = (readArg('network') ?? 'mainnet') as 'devnet' | 'mainnet';
  const provider = readArg('provider');
  const domainId = readArg('domainId');
  const partyId = readArg('partyId');

  if (!domainId || !partyId) {
    throw new Error('Missing required args: --domainId and --partyId');
  }

  const scanClient = new ScanApiClient(provider ? { network, provider } : { network });

  const partyToParticipant = await scanClient.getPartyToParticipant({ domainId, partyId });
  const participantId = partyToParticipant.participant_id;

  const status = await scanClient.getMemberTrafficStatus({ domainId, memberId: participantId });

  const trafficStatus = status.traffic_status;
  console.log(`Network: ${network}`);
  if (provider) {
    console.log(`Provider: ${provider}`);
  }
  console.log(`Domain: ${domainId}`);
  console.log(`Party: ${partyId}`);
  console.log(`Participant: ${participantId}`);
  console.log('Traffic status:');
  console.log(`  consumed:  ${trafficStatus.actual.total_consumed}`);
  console.log(`  limit:     ${trafficStatus.actual.total_limit}`);
  console.log(`  purchased: ${trafficStatus.target.total_purchased}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
