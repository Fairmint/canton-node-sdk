/**
 * Localnet JWT utilities for generating authentication tokens.
 *
 * This module provides JWT generation compatible with cn-quickstart's "unsafe-auth" mode.
 * JWTs are signed with HMAC-HS256 using the well-known secret "unsafe".
 */

import { createHmac } from 'crypto';

const UNSAFE_SECRET = 'unsafe';
const UNSAFE_ISSUER = 'unsafe-auth';
const DEFAULT_AUDIENCE = 'https://canton.network.global';
const DEFAULT_USER_ID = 'ledger-api-user';

interface LocalnetJwtOptions {
  /** User ID (sub claim). Defaults to 'ledger-api-user'. */
  userId?: string;
  /** JWT audience claim. Defaults to 'https://canton.network.global'. */
  audience?: string;
  /** Token expiry in seconds. Defaults to 3600 (1 hour). */
  expirySeconds?: number;
}

/**
 * Base64url encode a buffer or string.
 */
function base64urlEncode(data: Buffer | string): string {
  const buffer = typeof data === 'string' ? Buffer.from(data) : data;
  return buffer.toString('base64url');
}

/**
 * Generate a JWT for localnet authentication.
 *
 * This creates a JWT compatible with cn-quickstart's unsafe-auth mode,
 * signed with HMAC-HS256 using the secret "unsafe".
 *
 * @param options - JWT generation options
 * @returns A signed JWT string
 */
export function generateLocalnetJwt(options: LocalnetJwtOptions = {}): string {
  const userId = options.userId ?? DEFAULT_USER_ID;
  const audience = options.audience ?? DEFAULT_AUDIENCE;
  const expirySeconds = options.expirySeconds ?? 3600;

  const now = Math.floor(Date.now() / 1000);

  // JWT Header
  const header = {
    alg: 'HS256',
    typ: 'JWT',
  };

  // JWT Payload
  const payload = {
    sub: userId,
    aud: audience,
    iat: now,
    exp: now + expirySeconds,
    iss: UNSAFE_ISSUER,
  };

  // Encode header and payload
  const encodedHeader = base64urlEncode(JSON.stringify(header));
  const encodedPayload = base64urlEncode(JSON.stringify(payload));

  // Create signature
  const signatureInput = `${encodedHeader}.${encodedPayload}`;
  const signature = createHmac('sha256', UNSAFE_SECRET).update(signatureInput).digest();
  const encodedSignature = base64urlEncode(signature);

  return `${signatureInput}.${encodedSignature}`;
}

/**
 * Create a token generator function for localnet authentication.
 *
 * Returns a function suitable for use as `tokenGenerator` in AuthConfig.
 *
 * @param options - JWT generation options
 * @returns Token generator function
 */
export function createLocalnetTokenGenerator(options: LocalnetJwtOptions = {}): () => Promise<string> {
  return () => Promise.resolve(generateLocalnetJwt(options));
}
