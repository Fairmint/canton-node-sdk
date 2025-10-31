import type { PrivyClient } from '@privy-io/node';
import { StrKey } from '@stellar/stellar-base';
import type { StellarWallet } from './types';

/**
 * Retrieves an existing Stellar wallet from Privy by wallet ID
 *
 * @example
 *   ```typescript
 *   import { createPrivyClient, getStellarWallet } from '@fairmint/canton-node-sdk';
 *
 *   const privy = createPrivyClient({
 *     appId: process.env.PRIVY_APP_ID!,
 *     appSecret: process.env.PRIVY_APP_SECRET!
 *   });
 *
 *   const wallet = await getStellarWallet(privy, 'wallet-id-here');
 *   console.log('Wallet address:', wallet.address);
 *   ```;
 *
 * @param privyClient - Configured Privy client instance
 * @param walletId - The wallet ID to retrieve
 * @returns Promise resolving to the Stellar wallet information
 * @throws Error if wallet is not found or is not a Stellar wallet
 */
export async function getStellarWallet(privyClient: PrivyClient, walletId: string): Promise<StellarWallet> {
  // Get the wallet from Privy
  const privyWallet = await privyClient.wallets().get(walletId);

  // Verify it's a Stellar wallet
  if (privyWallet.chain_type !== 'stellar') {
    throw new Error(`Wallet ${walletId} is not a Stellar wallet. Found chain_type: ${privyWallet.chain_type}`);
  }

  // Decode Stellar address to get base64 public key
  const rawPublicKey = StrKey.decodeEd25519PublicKey(privyWallet.address);
  const publicKeyBase64 = Buffer.from(rawPublicKey).toString('base64');

  // Safely access owner property that may not be in type definitions
  const { owner } = privyWallet as { owner?: { user_id: string } };

  const result: StellarWallet = {
    id: privyWallet.id,
    address: privyWallet.address,
    chain_type: 'stellar',
    publicKeyBase64,
  };

  // Only include owner if it exists (for exactOptionalPropertyTypes compliance)
  if (owner) {
    result.owner = owner;
  }

  return result;
}
