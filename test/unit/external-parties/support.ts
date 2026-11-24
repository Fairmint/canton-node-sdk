import { createHash, generateKeyPairSync } from 'node:crypto';

export interface TestKey {
  /** Raw 32-byte key, base64. */
  readonly rawBase64: string;
  /** DER X.509 SubjectPublicKeyInfo, base64. */
  readonly publicKeyBase64: string;
  readonly fingerprint: string;
}

/** A fresh Ed25519 key, with its fingerprint computed independently with node:crypto. */
export function createKey(): TestKey {
  const der = generateKeyPairSync('ed25519').publicKey.export({ format: 'der', type: 'spki' });
  const raw = der.subarray(12);
  const purpose = Buffer.alloc(4);
  purpose.writeInt32BE(12);
  return {
    rawBase64: raw.toString('base64'),
    publicKeyBase64: der.toString('base64'),
    fingerprint: `1220${createHash('sha256').update(purpose).update(raw).digest('hex')}`,
  };
}
