import { Keypair } from '@stellar/stellar-base';

/**
 * Wraps a raw Ed25519 public key in DER X.509 SubjectPublicKeyInfo format
 *
 * The DER structure for Ed25519 public keys is: SEQUENCE { SEQUENCE { OBJECT IDENTIFIER id-Ed25519 (1.3.101.112) } BIT
 * STRING (raw public key) }
 *
 * @param rawPublicKey - Raw 32-byte Ed25519 public key
 * @returns DER-encoded public key in X.509 SubjectPublicKeyInfo format
 */
export function wrapEd25519PublicKeyInDER(rawPublicKey: Buffer): Buffer {
  if (rawPublicKey.length !== 32) {
    throw new Error(`Invalid Ed25519 public key length: ${rawPublicKey.length}, expected 32 bytes`);
  }

  // DER prefix for Ed25519 public keys in X.509 SubjectPublicKeyInfo format
  // 30 2a: SEQUENCE, length 42 (0x2a)
  // 30 05: SEQUENCE, length 5
  // 06 03: OBJECT IDENTIFIER, length 3
  // 2b 65 70: OID 1.3.101.112 (id-Ed25519)
  // 03 21: BIT STRING, length 33 (0x21)
  // 00: no unused bits
  const derPrefix = Buffer.from('302a300506032b6570032100', 'hex');

  return Buffer.concat([derPrefix, rawPublicKey]);
}

/**
 * Converts a Stellar public key to base64 format for Canton (DER-wrapped)
 *
 * Stellar Ed25519 keys can be used for Canton external signing. This function extracts the raw 32-byte public key,
 * wraps it in DER X.509 SubjectPublicKeyInfo format, and converts to base64.
 *
 * @param keypair - Stellar Keypair object
 * @returns Base64-encoded DER-wrapped public key in X.509 SubjectPublicKeyInfo format
 */
export function stellarPublicKeyToBase64(keypair: Keypair): string {
  const rawPublicKey = keypair.rawPublicKey();
  const derWrapped = wrapEd25519PublicKeyInDER(rawPublicKey);
  return derWrapped.toString('base64');
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
