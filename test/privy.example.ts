/**
 * Privy Stellar Wallet Example
 *
 * This example demonstrates how to:
 *
 * 1. Create a Privy client
 * 2. Create a new Stellar wallet
 * 3. Retrieve an existing wallet
 * 4. Sign data with a wallet
 *
 * Setup:
 *
 * 1. Copy example.env to .env: cp example.env .env
 * 2. Set PRIVY_APP_ID and PRIVY_APP_SECRET in .env
 * 3. Install dependencies: npm install
 *
 * Run: tsx test/privy.example.ts
 *
 * Note: This creates real wallets using the Privy API.
 */

import dotenv from 'dotenv';
import { createPrivyClientFromEnv, createStellarWallet, getStellarWallet, signWithWallet } from '../src/utils/privy';

// Load environment variables
dotenv.config();

/** Main example function */
async function main() {
  console.log('='.repeat(60));
  console.log('Privy Stellar Wallet Example');
  console.log('='.repeat(60));
  console.log();

  try {
    // Step 1: Create Privy client from environment variables
    console.log('Step 1: Creating Privy client...');
    const privy = createPrivyClientFromEnv();
    console.log('✓ Privy client created successfully');
    console.log();

    // Step 2: Create a new Stellar wallet
    console.log('Step 2: Creating new Stellar wallet...');
    const wallet = await createStellarWallet(privy);
    console.log('✓ Wallet created successfully');
    console.log('  Wallet ID:', wallet.id);
    console.log('  Stellar Address:', wallet.address);
    console.log('  Public Key (base64):', wallet.publicKeyBase64);
    console.log();

    // Step 3: Retrieve the wallet we just created
    console.log('Step 3: Retrieving wallet by ID...');
    const retrievedWallet = await getStellarWallet(privy, wallet.id);
    console.log('✓ Wallet retrieved successfully');
    console.log('  Address matches:', retrievedWallet.address === wallet.address);
    console.log();

    // Step 4: Sign some test data
    console.log('Step 4: Signing test data...');
    const testData = 'Hello, Canton Network!';
    const testDataHex = Buffer.from(testData).toString('hex');
    console.log('  Test data:', testData);
    console.log('  Test data (hex):', testDataHex);

    const signResult = await signWithWallet(privy, {
      walletId: wallet.id,
      data: testDataHex,
    });

    console.log('✓ Data signed successfully');
    console.log('  Signature (hex):', signResult.signature);
    console.log('  Signature (base64):', signResult.signatureBase64);
    console.log('  Encoding:', signResult.encoding);
    console.log();

    // Step 5: Sign using a Buffer
    console.log('Step 5: Signing with Buffer data...');
    const bufferData = Buffer.from('Another test message');
    const bufferSignResult = await signWithWallet(privy, {
      walletId: wallet.id,
      data: bufferData,
    });

    console.log('✓ Buffer data signed successfully');
    console.log('  Signature (base64):', bufferSignResult.signatureBase64);
    console.log();

    // Summary
    console.log('='.repeat(60));
    console.log('Example completed successfully! 🎉');
    console.log('='.repeat(60));
    console.log();
    console.log('Summary:');
    console.log('  - Created wallet with ID:', wallet.id);
    console.log('  - Stellar address:', wallet.address);
    console.log('  - Signed 2 test messages');
    console.log();
    console.log('You can use this wallet ID to retrieve and sign with it later.');
    console.log('Save this wallet ID for future use:', wallet.id);
    console.log();
  } catch (error) {
    console.error('❌ Error occurred:');
    if (error instanceof Error) {
      console.error('  Message:', error.message);
      if (error.stack) {
        console.error('  Stack:', error.stack);
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
