/**
 * Privy wallet types and interfaces
 */

/**
 * Options for creating a Privy client
 */
export interface PrivyClientOptions {
  /** Privy App ID from environment variables or provided directly */
  appId: string;
  /** Privy App Secret from environment variables or provided directly */
  appSecret: string;
}

/**
 * Options for creating a Stellar wallet
 */
export interface CreateStellarWalletOptions {
  /** Optional user ID to link the wallet to (format: did:privy:...) */
  userId?: string;
}

/**
 * Stellar wallet information returned from Privy
 */
export interface StellarWallet {
  /** Wallet ID (used for signing operations) */
  id: string;
  /** Stellar public address */
  address: string;
  /** Chain type (always 'stellar' for Stellar wallets) */
  chain_type: 'stellar';
  /** Owner information if wallet is linked to a user */
  owner?: {
    user_id: string;
  };
  /** Base64 encoded public key (derived from address) */
  publicKeyBase64: string;
}

/**
 * Options for signing data with a Stellar wallet
 */
export interface SignOptions {
  /** Wallet ID to use for signing */
  walletId: string;
  /** Data to sign (will be hex encoded if not already) */
  data: string | Buffer;
}

/**
 * Result of a signing operation
 */
export interface SignResult {
  /** Signature in hex format (with 0x prefix) */
  signature: string;
  /** Signature encoding format */
  encoding: string;
  /** Signature in base64 format */
  signatureBase64: string;
}
