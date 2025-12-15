/**
 * Example: Get Member Traffic Status from Scan API
 *
 * This example demonstrates how to use the ScanApiClient to query
 * public scan endpoints. The client automatically rotates through
 * available scan endpoints if one fails.
 *
 * Usage:
 *   npx tsx examples/scan-traffic-status.ts [network]
 *
 * Where [network] is 'mainnet' or 'devnet' (defaults to 'devnet')
 */

import { ScanApiClient, type NetworkType } from '../src';

async function main(): Promise<void> {
  // Get network from command line args (default to devnet)
  const network = (process.argv[2] as NetworkType) || 'devnet';

  if (!['mainnet', 'devnet'].includes(network)) {
    console.error('Usage: npx tsx examples/scan-traffic-status.ts [mainnet|devnet]');
    process.exit(1);
  }

  console.log(`\n🔍 Scan API Example`);
  console.log(`Network: ${network}`);
  console.log('─'.repeat(50));

  // Create the scan client for the specified network
  const scanClient = new ScanApiClient({ network });

  // Show available endpoints
  const endpoints = scanClient.getEndpoints();
  console.log(`\n📡 Available scan endpoints (${endpoints.length}):`);
  endpoints.slice(0, 3).forEach((ep) => console.log(`   • ${ep.name}`));
  if (endpoints.length > 3) {
    console.log(`   ... and ${endpoints.length - 3} more`);
  }

  try {
    // First, get DSO info to understand the current state
    console.log('\n📊 Fetching DSO info...');
    const dsoInfo = await scanClient.getDsoInfo({});
    const currentEndpoint = scanClient.getCurrentEndpoint();
    console.log(`   Using endpoint: ${currentEndpoint?.name ?? 'unknown'}`);
    console.log(`   DSO Party: ${dsoInfo.dso_party_id}`);
    console.log(`   SV Party: ${dsoInfo.sv_party_id}`);

    // Get the list of scans to find available SVs
    console.log('\n📋 Fetching available scans...');
    const scans = await scanClient.listDsoScans({});
    const domainIds = Object.keys(scans.scans);

    if (domainIds.length === 0) {
      console.log('   No domains available');
      return;
    }

    const domainId = domainIds[0];
    if (!domainId) {
      console.log('   No domain ID available');
      return;
    }
    console.log(`   Found ${domainIds.length} domain(s)`);
    console.log(`   Using domain: ${domainId.slice(0, 40)}...`);

    // Get the SVs from the scan list
    const svScans = scans.scans[domainId as keyof typeof scans.scans];
    if (!svScans || !Array.isArray(svScans) || svScans.length === 0) {
      console.log('   No SVs found in this domain');
      return;
    }

    // Show available SVs
    console.log(`\n🖥️  Available SVs in domain (${svScans.length}):`);
    svScans.slice(0, 5).forEach((sv: { public_url: string }) => {
      console.log(`   • ${sv.public_url}`);
    });
    if (svScans.length > 5) {
      console.log(`   ... and ${svScans.length - 5} more`);
    }

    // Get open mining rounds
    console.log('\n⛏️  Fetching open mining rounds...');
    const rounds = await scanClient.getOpenAndIssuingMiningRounds({});

    const openRoundsArray = Object.values(rounds.open_mining_rounds);
    const issuingRoundsArray = Object.values(rounds.issuing_mining_rounds);

    console.log(`   Open rounds: ${openRoundsArray.length}`);
    console.log(`   Issuing rounds: ${issuingRoundsArray.length}`);

    if (openRoundsArray.length > 0) {
      const latestRound = openRoundsArray[openRoundsArray.length - 1];
      if (latestRound?.contract?.payload) {
        console.log(`   Latest open round contract ID: ${latestRound.contract.contract_id.slice(0, 40)}...`);
      }
    }

    // Get version info
    console.log('\n📦 Fetching version info...');
    const version = await scanClient.getVersion({});
    console.log(`   Version: ${version.version}`);

    console.log('\n✅ Scan API example completed successfully!');
    console.log('─'.repeat(50));
  } catch (error) {
    console.error('\n❌ Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main().catch(console.error);
