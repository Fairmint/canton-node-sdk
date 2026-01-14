import { Keypair } from '@stellar/stellar-base';
import {
  generateStellarKeypair,
  loadStellarKeypair,
  signHexWithStellarKeypair,
  signWithStellarKeypair,
  stellarPublicKeyToBase64,
  stellarPublicKeyToHex,
  wrapEd25519PublicKeyInDER,
} from '../../../src/utils/external-signing/stellar-utils';

describe('stellar-utils', () => {
  let keypair: Keypair;

  beforeEach(() => {
    // Use a deterministic keypair for reproducible tests
    // Generated from Keypair.random().secret()
    keypair = Keypair.fromSecret('SBGWSG6BTNCKCOB3DIFBGCVMUPQFYPA2G4O34RMTB343OYPXU5DJDVMN');
  });

  describe('wrapEd25519PublicKeyInDER', () => {
    it('wraps a 32-byte Ed25519 public key in DER format', () => {
      const rawPublicKey = keypair.rawPublicKey();
      const wrapped = wrapEd25519PublicKeyInDER(rawPublicKey);

      // DER prefix is 12 bytes, plus 32-byte key = 44 bytes total
      expect(wrapped.length).toBe(44);

      // Verify DER prefix (OID for Ed25519: 1.3.101.112)
      const derPrefix = Buffer.from('302a300506032b6570032100', 'hex');
      expect(wrapped.subarray(0, 12).equals(derPrefix)).toBe(true);

      // Verify the public key is at the end
      expect(wrapped.subarray(12).equals(rawPublicKey)).toBe(true);
    });

    it('throws error for invalid key length', () => {
      const invalidKey = Buffer.alloc(16); // Wrong size
      expect(() => wrapEd25519PublicKeyInDER(invalidKey)).toThrow(
        'Invalid Ed25519 public key length: 16, expected 32 bytes'
      );
    });

    it('throws error for empty buffer', () => {
      const emptyKey = Buffer.alloc(0);
      expect(() => wrapEd25519PublicKeyInDER(emptyKey)).toThrow(
        'Invalid Ed25519 public key length: 0, expected 32 bytes'
      );
    });
  });

  describe('stellarPublicKeyToBase64', () => {
    it('returns base64-encoded DER-wrapped public key', () => {
      const result = stellarPublicKeyToBase64(keypair);

      // Should be a valid base64 string
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);

      // Decode and verify structure
      const decoded = Buffer.from(result, 'base64');
      expect(decoded.length).toBe(44); // DER prefix (12) + key (32)
    });

    it('produces consistent output for same keypair', () => {
      const result1 = stellarPublicKeyToBase64(keypair);
      const result2 = stellarPublicKeyToBase64(keypair);
      expect(result1).toBe(result2);
    });
  });

  describe('stellarPublicKeyToHex', () => {
    it('returns hex-encoded raw public key', () => {
      const result = stellarPublicKeyToHex(keypair);

      // Should be 64 hex characters (32 bytes)
      expect(result.length).toBe(64);
      expect(/^[0-9a-f]+$/.test(result)).toBe(true);
    });

    it('matches raw public key bytes', () => {
      const result = stellarPublicKeyToHex(keypair);
      const rawKey = keypair.rawPublicKey();
      expect(result).toBe(rawKey.toString('hex'));
    });
  });

  describe('signWithStellarKeypair', () => {
    it('signs data provided as Buffer', () => {
      const data = Buffer.from('test message');
      const signature = signWithStellarKeypair(keypair, data);

      // Should be base64 encoded
      expect(typeof signature).toBe('string');
      const decoded = Buffer.from(signature, 'base64');
      // Ed25519 signatures are 64 bytes
      expect(decoded.length).toBe(64);
    });

    it('signs data provided as base64 string', () => {
      const dataBuffer = Buffer.from('test message');
      const dataBase64 = dataBuffer.toString('base64');
      const signature = signWithStellarKeypair(keypair, dataBase64);

      expect(typeof signature).toBe('string');
      const decoded = Buffer.from(signature, 'base64');
      expect(decoded.length).toBe(64);
    });

    it('produces verifiable signature', () => {
      const data = Buffer.from('test message');
      const signature = signWithStellarKeypair(keypair, data);
      const sigBuffer = Buffer.from(signature, 'base64');

      // Verify using Stellar's verify method
      expect(keypair.verify(data, sigBuffer)).toBe(true);
    });

    it('produces consistent signatures for same data', () => {
      const data = Buffer.from('test message');
      const sig1 = signWithStellarKeypair(keypair, data);
      const sig2 = signWithStellarKeypair(keypair, data);
      // Ed25519 signatures are deterministic
      expect(sig1).toBe(sig2);
    });
  });

  describe('signHexWithStellarKeypair', () => {
    it('signs hex-encoded hash and returns hex signature', () => {
      const hexHash = 'deadbeef0123456789abcdef';
      const signature = signHexWithStellarKeypair(keypair, hexHash);

      // Should be hex encoded (128 chars for 64 bytes)
      expect(signature.length).toBe(128);
      expect(/^[0-9a-f]+$/.test(signature)).toBe(true);
    });

    it('produces verifiable hex signature', () => {
      const hexHash = 'deadbeef0123456789abcdef';
      const signature = signHexWithStellarKeypair(keypair, hexHash);
      const sigBuffer = Buffer.from(signature, 'hex');
      const dataBuffer = Buffer.from(hexHash, 'hex');

      expect(keypair.verify(dataBuffer, sigBuffer)).toBe(true);
    });
  });

  describe('loadStellarKeypair', () => {
    it('loads keypair from valid secret', () => {
      const secret = 'SBGWSG6BTNCKCOB3DIFBGCVMUPQFYPA2G4O34RMTB343OYPXU5DJDVMN';
      const loaded = loadStellarKeypair(secret);

      expect(loaded.publicKey()).toBe(keypair.publicKey());
      expect(loaded.secret()).toBe(secret);
    });

    it('throws for invalid secret', () => {
      expect(() => loadStellarKeypair('invalid-secret')).toThrow();
    });
  });

  describe('generateStellarKeypair', () => {
    it('generates a valid random keypair', () => {
      const generated = generateStellarKeypair();

      // Should have valid public key (starts with G)
      expect(generated.publicKey().startsWith('G')).toBe(true);
      // Should have valid secret (starts with S)
      expect(generated.secret().startsWith('S')).toBe(true);
    });

    it('generates unique keypairs', () => {
      const kp1 = generateStellarKeypair();
      const kp2 = generateStellarKeypair();

      expect(kp1.publicKey()).not.toBe(kp2.publicKey());
      expect(kp1.secret()).not.toBe(kp2.secret());
    });

    it('generated keypair can sign and verify', () => {
      const generated = generateStellarKeypair();
      const data = Buffer.from('test');
      const signature = generated.sign(data);

      expect(generated.verify(data, signature)).toBe(true);
    });
  });
});
