/**
 * Standard base64 for the key and signature of a wallet proof. Wallets differ (Loop answers hex, Privy base64, some
 * base64url), and a proof shown for copying must verify with a server that decodes base64 only. Browser-safe: bytes go
 * through `atob` and `btoa`, never `Buffer`.
 */

const HEX_KEY = /^[0-9a-fA-F]{64}$/;
const HEX_SIGNATURE = /^[0-9a-fA-F]{128}$/;
/** A DER SubjectPublicKeyInfo of an Ed25519 key: a 12-byte header and the 32-byte key. */
const DER_KEY_BYTES = 44;
const BASE64 = /^[A-Za-z0-9+/_-]*={0,2}$/;

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

/** The bytes of standard or URL-safe base64 (padding optional), or undefined when `value` is not base64. */
function fromBase64(value: string): Uint8Array | undefined {
  if (value.length === 0 || !BASE64.test(value)) return undefined;
  const unpadded = value.replace(/=+$/, '').replace(/-/g, '+').replace(/_/g, '/');
  if (unpadded.length % 4 === 1) return undefined;
  try {
    const binary = atob(unpadded.padEnd(Math.ceil(unpadded.length / 4) * 4, '='));
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return undefined;
  }
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * The public key as standard base64: 64 hex characters (a raw Ed25519 key, as Loop reports it) become the base64 of the
 * 32 bytes; base64 (raw 32 bytes, or a DER SubjectPublicKeyInfo) becomes the base64 of its decoded bytes. Anything else
 * is returned as given, for the server to refuse.
 */
export function publicKeyToBase64(value: string): string {
  if (HEX_KEY.test(value)) return toBase64(fromHex(value));
  const bytes = fromBase64(value);
  return bytes !== undefined && (bytes.length === 32 || bytes.length === DER_KEY_BYTES) ? toBase64(bytes) : value;
}

/**
 * The signature as standard base64 of its 64 bytes, from 128 hex characters or base64 (standard or URL-safe). Anything
 * else is returned as given, for the server to refuse.
 */
export function signatureToBase64(value: string): string {
  if (HEX_SIGNATURE.test(value)) return toBase64(fromHex(value));
  const bytes = fromBase64(value);
  return bytes?.length === 64 ? toBase64(bytes) : value;
}
