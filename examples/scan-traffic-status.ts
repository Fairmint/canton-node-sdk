#!/usr/bin/env tsx
import { ScanClient } from '../src';

async function main() {
  // Use devnet
  const client = new ScanClient({
    network: 'devnet',
  });

  console.log(`Connecting to Scan API (${client.getApiUrl()})...`);

  try {
    // 1. Get DSO Info
    console.log('Fetching DSO Info...');
    const dsoInfo = await client.getDsoInfo();
    
    // Extract Domain ID from latest mining round or amulet rules
    // Note: The generated types might have specific structure.
    // Based on inspection, dsoInfo should have latest_mining_round which has domain_id
    const domainId = (dsoInfo as any).latest_mining_round?.domain_id || (dsoInfo as any).amulet_rules?.domain_id;
    
    if (!domainId) {
        throw new Error('Could not find domain_id in DSO Info (latest_mining_round or amulet_rules)');
    }
    console.log(`Domain ID: ${domainId}`);

    // Extract SV Party ID (Member ID)
    const memberId = (dsoInfo as any).sv_party_id;
    console.log(`Member ID (SV Party): ${memberId}`);

    // 2. Check Traffic Status
    if (memberId && domainId) {
        console.log(`Checking traffic status for member ${memberId} on domain ${domainId}...`);
        const trafficStatus = await client.getMemberTrafficStatus({
            domain_id: domainId,
            member_id: memberId
        });
        console.log('Traffic Status:', JSON.stringify(trafficStatus, null, 2));
    } else {
        console.error('Missing member_id or domain_id');
    }

  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

void main();
