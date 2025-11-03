import type { PrivyClient } from '@privy-io/node';

/**
 * Signs data with a Privy-managed Stellar wallet
 *
 * @param privyClient - Privy client instance
 * @param walletId - Wallet ID to sign with
 * @param data - Data to sign (as Buffer or base64 string)
 * @returns Base64-encoded signature
 */
export async function signWithPrivyWallet(
  privyClient: PrivyClient,
  walletId: string,
  data: Buffer | string
): Promise<string> {
  const { signWithWallet } = await import('../privy/signData');

  // Convert data to hex
  const hexData = typeof data === 'string'
    ? Buffer.from(data, 'base64').toString('hex')
    : data.toString('hex');

  const signResult = await signWithWallet(privyClient, {
    walletId,
    data: hexData,
  });

  // Return base64-encoded signature
  return signResult.signatureBase64;
}

/**
 * Wallet info stored in key files for Privy-based external parties
 */
export interface PrivyWalletKeyData {
  partyName: string;
  partyId: string;
  userId: string;
  walletId: string;
  stellarAddress: string;
  publicKey: string;
  publicKeyFingerprint: string;
  synchronizerId: string;
  network: string;
  provider: string;
  createdAt: string;
}
