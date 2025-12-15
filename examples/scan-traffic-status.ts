/**
 * Example: Query traffic status from the Scan API
 *
 * Usage: npx tsx examples/scan-traffic-status.ts [mainnet|devnet]
 */

import { ScanApiClient, type NetworkType } from '../src';

async function main(): Promise<void> {
  const network: NetworkType = (process.argv[2] as NetworkType | undefined) ?? 'devnet';
  const client = new ScanApiClient({ network });

  // Get domain and party info, then fetch traffic status
  const scans = await client.listDsoScans({});
  const domainId = Object.keys(scans.scans)[0]!;
  const dsoInfo = await client.getDsoInfo({});

  const status = await client.getMemberTrafficStatus({
    domainId,
    memberId: dsoInfo.sv_party_id,
  });

  console.log(`Traffic status for ${dsoInfo.sv_party_id} on ${network}:`);
  console.log(JSON.stringify(status, null, 2));
}

main().catch(console.error);
