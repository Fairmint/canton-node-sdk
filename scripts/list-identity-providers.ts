#!/usr/bin/env tsx
import 'dotenv/config';
import { LedgerJsonApiClient } from '../src';

/** List all configured identity providers in the Canton system */
async function main(): Promise<void> {
  console.log('=== List Identity Providers ===\n');

  try {
    const client = new LedgerJsonApiClient();

    console.log('Fetching identity provider configs...\n');
    const result = await client.listIdentityProviderConfigs({});

    if (!result.identityProviderConfigs || result.identityProviderConfigs.length === 0) {
      console.log('No identity providers configured.');
      return;
    }

    console.log(`Found ${result.identityProviderConfigs.length} identity provider(s):\n`);

    result.identityProviderConfigs.forEach((config, index) => {
      console.log(`${index + 1}. Identity Provider ID: "${config.identityProviderId}"`);
      console.log(`   Issuer: ${config.issuer}`);
      console.log(`   JWKS URL: ${config.jwksUrl}`);
      console.log(`   Audience: ${config.audience ?? 'N/A'}`);
      console.log(`   Is Deactivated: ${config.isDeactivated}`);
      console.log('');
    });

    console.log('✓ Done!');
  } catch (error) {
    console.error('\n✗ Failed to list identity providers:');
    console.error(`  ${error instanceof Error ? error.message : String(error)}`);
    if (error instanceof Error && error.stack) {
      console.error(`\nStack trace:`);
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
