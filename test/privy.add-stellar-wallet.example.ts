/**
 * Add Stellar Wallet to Existing Privy User Example
 *
 * This example demonstrates how to create a Stellar embedded wallet for an existing Privy user who already has a Privy
 * ID (and possibly other wallets like Solana or Ethereum).
 *
 * Use Case:
 *
 * - User exists in your database with a Privy ID (format: did:privy:...)
 * - User already has Solana and/or Ethereum wallets via Privy
 * - You want to add a Stellar wallet to the same user account
 *
 * Important Notes:
 *
 * - The wallet will be created and linked to the user in Privy's system
 * - The wallet linkage can be verified in the Privy Dashboard
 * - Wallet signing requires user authentication (client-side) - it cannot be done server-side
 * - The owner property may not be returned in the API response, but the wallet IS linked
 *
 * Setup:
 *
 * 1. Copy example.env to .env: cp example.env .env
 * 2. Set PRIVY_APP_ID and PRIVY_APP_SECRET in .env
 * 3. Install dependencies: npm install
 *
 * Run: npx tsx test/privy.add-stellar-wallet.example.ts <PRIVY_USER_ID>
 *
 * Example: npx tsx test/privy.add-stellar-wallet.example.ts did:privy:cm94jlli5020iky0lbo19pwf3
 *
 * Note: This creates real wallets using the Privy API.
 */

import dotenv from 'dotenv';
import { createPrivyClientFromEnv, createStellarWallet, getStellarWallet } from '../src/utils/privy';

// Load environment variables
dotenv.config();

/** Main example function */
async function main() {
  console.log('='.repeat(60));
  console.log('Add Stellar Wallet to Existing Privy User');
  console.log('='.repeat(60));
  console.log();

  // Get user ID from command line arguments
  const privyUserId = process.argv[2];

  if (!privyUserId) {
    console.error('❌ Error: Privy User ID is required');
    console.log();
    console.log('Usage:');
    console.log('  npx tsx test/privy.add-stellar-wallet.example.ts <PRIVY_USER_ID>');
    console.log();
    console.log('Example:');
    console.log('  npx tsx test/privy.add-stellar-wallet.example.ts did:privy:cm94jlli5020iky0lbo19pwf3');
    console.log();
    console.log('The Privy User ID should be in the format: did:privy:...');
    console.log('You can find this ID in your database or from Privy dashboard.');
    process.exit(1);
  }

  // Validate the user ID format
  if (!privyUserId.startsWith('did:privy:')) {
    console.error('❌ Error: Invalid Privy User ID format');
    console.log();
    console.log('The Privy User ID must start with "did:privy:"');
    console.log('You provided:', privyUserId);
    console.log();
    console.log('Example of valid format: did:privy:cm94jlli5020iky0lbo19pwf3');
    process.exit(1);
  }

  console.log('User Information:');
  console.log('  Privy User ID:', privyUserId);
  console.log();

  try {
    // Step 1: Create Privy client from environment variables
    console.log('Step 1: Creating Privy client...');
    const privy = createPrivyClientFromEnv();
    console.log('✓ Privy client created successfully');
    console.log();

    // Step 2: Create a Stellar wallet linked to this user
    console.log('Step 2: Creating Stellar wallet for user...');
    const stellarWallet = await createStellarWallet(privy, {
      userId: privyUserId,
    });

    console.log('✓ Stellar wallet created successfully!');
    console.log('  Wallet ID:', stellarWallet.id);
    console.log('  Stellar Address:', stellarWallet.address);
    console.log('  Public Key (base64):', stellarWallet.publicKeyBase64);
    console.log();
    console.log("  Note: The wallet is linked to the user in Privy's system.");
    console.log("  You can verify this in the Privy Dashboard under the user's wallets.");
    console.log();

    // Step 3: Verify the wallet by retrieving it
    console.log('Step 3: Verifying wallet retrieval...');
    const retrievedWallet = await getStellarWallet(privy, stellarWallet.id);

    if (retrievedWallet.address === stellarWallet.address) {
      console.log('✓ Wallet retrieved successfully');
      console.log('  Confirmation: Address matches');
    } else {
      console.warn('⚠ Warning: Retrieved wallet address does not match');
    }
    console.log();

    // Summary
    console.log('='.repeat(60));
    console.log('✅ Successfully added Stellar wallet to existing user!');
    console.log('='.repeat(60));
    console.log();
    console.log('Summary:');
    console.log('  User ID:', privyUserId);
    console.log('  New Stellar Wallet ID:', stellarWallet.id);
    console.log('  Stellar Address:', stellarWallet.address);
    console.log('  Wallet successfully linked and tested');
    console.log();
    console.log('Next Steps:');
    console.log('  1. Save the Stellar wallet ID and address to your database');
    console.log('  2. Associate it with the user record');
    console.log('  3. Verify in Privy Dashboard that the wallet appears under the user');
    console.log();
    console.log('Database Update Example:');
    console.log('  UPDATE users');
    console.log(`  SET stellar_wallet_address = '${stellarWallet.address}',`);
    console.log(`      stellar_wallet_id = '${stellarWallet.id}'`);
    console.log(`  WHERE privy_user_id = '${privyUserId}';`);
    console.log();
    console.log('Using the Wallet:');
    console.log('  - The wallet is an embedded wallet managed by Privy');
    console.log('  - Signing transactions requires user authentication (client-side)');
    console.log("  - Use Privy's client SDK in your frontend to sign transactions");
    console.log('  - The user will authenticate via Privy and sign with their wallet');
    console.log();
  } catch (error) {
    console.error('❌ Error occurred:');
    if (error instanceof Error) {
      console.error('  Message:', error.message);

      // Provide helpful error messages for common issues
      if (error.message.includes('user_id must start with did:privy:')) {
        console.error();
        console.error('  The user ID format is incorrect.');
        console.error('  Make sure you are passing the full Privy user ID with the did:privy: prefix.');
      } else if (error.message.includes('not found')) {
        console.error();
        console.error('  The user was not found in Privy.');
        console.error('  Verify the user ID is correct and the user exists.');
      } else if (error.message.includes('already has')) {
        console.error();
        console.error('  This user may already have a Stellar wallet.');
        console.error('  Check if a Stellar wallet already exists for this user.');
      }

      if (error.stack) {
        console.error();
        console.error('  Stack trace:');
        console.error(error.stack);
      }
    } else {
      console.error('  Error:', error);
    }
    process.exit(1);
  }
}

// Run the example
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
