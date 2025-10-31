import type { PrivyClient } from '@privy-io/node';
import { StrKey } from '@stellar/stellar-base';
import type { CreateStellarWalletOptions, StellarWallet } from './types';

/**
 * Creates a new Stellar wallet using Privy
 *
 * @example
 *   ```typescript
 *   import { createPrivyClient, createStellarWallet } from '@fairmint/canton-node-sdk';
 *
 *   const privy = createPrivyClient({
 *     appId: process.env.PRIVY_APP_ID!,
 *     appSecret: process.env.PRIVY_APP_SECRET!
 *   });
 *
 *   // Create unlinked wallet
 *   const wallet = await createStellarWallet(privy);
 *
 *   // Create wallet linked to a user
 *   const userWallet = await createStellarWallet(privy, {
 *     userId: 'did:privy:...'
 *   });
 *   ```;
 *
 * @param privyClient - Configured Privy client instance
 * @param options - Optional configuration for wallet creation
 * @returns Promise resolving to the created Stellar wallet information
 * @throws Error if wallet creation fails or userId format is invalid
 */
export async function createStellarWallet(
  privyClient: PrivyClient,
  options?: CreateStellarWalletOptions
): Promise<StellarWallet> {
  // Validate userId format if provided
  if (options?.userId && !options.userId.startsWith('did:privy:')) {
    throw new Error(`Invalid user ID format. User ID must start with "did:privy:", got: ${options.userId}`);
  }

  // Create wallet request
  const createRequest: { chain_type: 'stellar'; owner?: { user_id: string } } = {
    chain_type: 'stellar',
  };

  if (options?.userId) {
    createRequest.owner = { user_id: options.userId };
  }

  // Create the wallet
  const privyWallet = await privyClient.wallets().create(createRequest);

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
