import type { PrivyClient } from '@privy-io/node';
import type { SignOptions, SignResult } from './types';

/**
 * Signs data using a Stellar wallet managed by Privy
 *
 * @example
 *   ```typescript
 *   import { createPrivyClient, signWithWallet } from '@fairmint/canton-node-sdk';
 *
 *   const privy = createPrivyClient({
 *     appId: process.env.PRIVY_APP_ID!,
 *     appSecret: process.env.PRIVY_APP_SECRET!
 *   });
 *
 *   // Sign a hex string
 *   const result = await signWithWallet(privy, {
 *     walletId: 'wallet-id-here',
 *     data: 'deadbeef'
 *   });
 *
 *   // Sign a Buffer
 *   const bufferResult = await signWithWallet(privy, {
 *     walletId: 'wallet-id-here',
 *     data: Buffer.from('test message')
 *   });
 *   ```;
 *
 * @param privyClient - Configured Privy client instance
 * @param options - Signing options including wallet ID and data
 * @returns Promise resolving to the signature result
 * @throws Error if signing fails
 */
export async function signWithWallet(privyClient: PrivyClient, options: SignOptions): Promise<SignResult> {
  const { walletId, data } = options;

  // Convert data to hex if it's a Buffer
  let hexData: string;
  if (Buffer.isBuffer(data)) {
    hexData = data.toString('hex');
  } else {
    // Remove 0x prefix if present
    hexData = data.startsWith('0x') ? data.slice(2) : data;
  }

  // Validate hex string
  if (!/^[0-9a-fA-F]*$/.test(hexData)) {
    throw new Error(`Invalid hex data: ${hexData}`);
  }

  // Sign using Privy's rawSign API
  const { signature, encoding } = await privyClient.wallets().rawSign(walletId, {
    params: { hash: `0x${hexData}` },
  });
  // Remove 0x prefix and convert to base64
  const signatureHex = signature.startsWith('0x') ? signature.slice(2) : signature;
  const signatureBase64 = Buffer.from(signatureHex, 'hex').toString('base64');

  return {
    signature,
    encoding,
    signatureBase64,
  };
}
