import { Keypair } from '@stellar/stellar-base';

/**
 * Converts a Stellar public key to base64 format for Canton
 *
 * Stellar Ed25519 keys can be used for Canton external signing. This function extracts the raw 32-byte public key and
 * converts it to base64.
 *
 * @param keypair - Stellar Keypair object
 * @returns Base64-encoded public key
 */
export function stellarPublicKeyToBase64(keypair: Keypair): string {
  return keypair.rawPublicKey().toString('base64');
}

/**
 * Signs data with a Stellar keypair
 *
 * @param keypair - Stellar Keypair object
 * @param data - Data to sign (as Buffer or base64 string)
 * @returns Base64-encoded signature
 */
export function signWithStellarKeypair(keypair: Keypair, data: Buffer | string): string {
  const dataBuffer = typeof data === 'string' ? Buffer.from(data, 'base64') : data;
  const signature = keypair.sign(dataBuffer);
  return signature.toString('base64');
}

/**
 * Load a Stellar keypair from a secret key
 *
 * @param secret - Stellar secret key (starts with 'S')
 * @returns Stellar Keypair object
 */
export function loadStellarKeypair(secret: string): Keypair {
  return Keypair.fromSecret(secret);
}

/**
 * Generate a new random Stellar keypair
 *
 * @returns Stellar Keypair object
 */
export function generateStellarKeypair(): Keypair {
  return Keypair.random();
}

/**
 * Convert Stellar public key to hex string (for Validator API)
 *
 * @param keypair - Stellar keypair
 * @returns Hex-encoded public key
 */
export function stellarPublicKeyToHex(keypair: Keypair): string {
  return keypair.rawPublicKey().toString('hex');
}

/**
 * Sign hex-encoded hash with Stellar keypair (for Validator API)
 *
 * @param keypair - Stellar keypair to sign with
 * @param hexHash - Hex-encoded hash to sign
 * @returns Hex-encoded signature
 */
export function signHexWithStellarKeypair(keypair: Keypair, hexHash: string): string {
  const dataBuffer = Buffer.from(hexHash, 'hex');
  const signature = keypair.sign(dataBuffer);
  return signature.toString('hex');
}
