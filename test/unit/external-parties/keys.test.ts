import * as NodeProtocol from '../../../src/utils/external-signing/canton-protocol';
import {
  buildExternalPartyId,
  decodeEd25519PublicKey,
  deriveCantonEd25519PublicKeyFingerprint,
  isCantonPublicKeyFingerprint,
  isExternalPartyError,
  normalizeEd25519PublicKeyForCanton,
  parseExternalPartyId,
  readPartyNamespace,
} from '../../../src/external-parties';
import * as Root from '../../../src';
import { createKey } from './support';

const SMALL_ORDER = Buffer.from('0100000000000000000000000000000000000000000000000000000000000000', 'hex');
const FIELD_PRIME = Buffer.from('edffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f', 'hex');
const DER_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

describe('external-parties keys', () => {
  it('derives the fingerprint 1220 + hex(sha256(int32be(12) || rawKey)) from raw or DER keys, as the Node helper does', () => {
    for (let index = 0; index < 50; index += 1) {
      const key = createKey();
      expect(deriveCantonEd25519PublicKeyFingerprint(key.publicKeyBase64)).toBe(key.fingerprint);
      expect(deriveCantonEd25519PublicKeyFingerprint(key.rawBase64)).toBe(key.fingerprint);
      // Padding is optional, as in the Node decoder.
      expect(deriveCantonEd25519PublicKeyFingerprint(key.rawBase64.replace(/=+$/, ''))).toBe(key.fingerprint);
      expect(deriveCantonEd25519PublicKeyFingerprint(key.rawBase64.replace(/\+/g, '-').replace(/\//g, '_'))).toBe(
        key.fingerprint
      );
      expect(NodeProtocol.deriveCantonEd25519PublicKeyFingerprint(key.publicKeyBase64)).toBe(key.fingerprint);
      expect(isCantonPublicKeyFingerprint(key.fingerprint)).toBe(true);
      expect(normalizeEd25519PublicKeyForCanton(key.rawBase64)).toBe(key.publicKeyBase64);
      expect(NodeProtocol.normalizeEd25519PublicKeyForCanton(key.rawBase64)).toBe(key.publicKeyBase64);
      expect(Buffer.from(decodeEd25519PublicKey(key.publicKeyBase64)).toString('base64')).toBe(key.rawBase64);
    }
  });

  it('refuses exactly the keys the Node helper refuses', () => {
    const nonCanonical = Buffer.from(FIELD_PRIME);
    const highBit = Buffer.from(createKey().rawBase64, 'base64');
    const inputs = [
      '',
      'not base64!',
      'QUJD',
      SMALL_ORDER.toString('base64'),
      Buffer.concat([DER_PREFIX, SMALL_ORDER]).toString('base64'),
      nonCanonical.toString('base64'),
      Buffer.concat([Buffer.from('302a300506032b6571032100', 'hex'), highBit]).toString('base64'),
      Buffer.alloc(33, 1).toString('base64'),
      `${createKey().rawBase64.slice(0, -2)}B=`,
      // Excess padding on a canonical raw or DER key.
      `${createKey().rawBase64}=`,
      `${createKey().publicKeyBase64}=`,
    ];
    for (const input of inputs) {
      expect(() => NodeProtocol.extractRawEd25519PublicKey(input)).toThrow();
      let thrown: unknown;
      try {
        decodeEd25519PublicKey(input);
      } catch (error) {
        thrown = error;
      }
      expect(isExternalPartyError(thrown, 'INVALID_INPUT')).toBe(true);
    }
  });

  it('refuses all eight small-order points (the torsion subgroup), in this module and the Node helper', () => {
    // The multiples 0..7 of an order-8 point, as encoded by @noble/curves.
    for (const hex of [
      '0100000000000000000000000000000000000000000000000000000000000000',
      'c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac037a',
      '0000000000000000000000000000000000000000000000000000000000000080',
      '26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc05',
      'ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f',
      '26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc85',
      '0000000000000000000000000000000000000000000000000000000000000000',
      'c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac03fa',
    ]) {
      const key = Buffer.from(hex, 'hex').toString('base64');
      expect(() => decodeEd25519PublicKey(key)).toThrow(/small-order point/);
      expect(() => NodeProtocol.extractRawEd25519PublicKey(key)).toThrow(/Invalid Ed25519 public key/);
    }
  });

  it('refuses a small-order point with either sign bit, as the Node helper does', () => {
    // y = 0 with the sign bit set is the order-4 point; y = 1 and y = -1 with it set encode x = -0.
    for (const hex of [
      '0000000000000000000000000000000000000000000000000000000000000080',
      '0100000000000000000000000000000000000000000000000000000000000080',
      'ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
    ]) {
      const key = Buffer.from(hex, 'hex').toString('base64');
      expect(() => decodeEd25519PublicKey(key)).toThrow(/small-order point/);
      expect(() => NodeProtocol.extractRawEd25519PublicKey(key)).toThrow(/Invalid Ed25519 public key/);
    }
  });

  it('says which check refused a key', () => {
    expect(() => decodeEd25519PublicKey(SMALL_ORDER.toString('base64'))).toThrow(/small-order point is not safe/);
    // The field prime plus one: a y coordinate at or above the prime that is not a small-order point.
    const abovePrime = Buffer.from(FIELD_PRIME);
    abovePrime[0] = 0xee;
    expect(() => decodeEd25519PublicKey(abovePrime.toString('base64'))).toThrow(/not canonically encoded/);
    expect(() => NodeProtocol.extractRawEd25519PublicKey(abovePrime.toString('base64'))).toThrow();
    expect(() => decodeEd25519PublicKey(Buffer.alloc(33, 1).toString('base64'))).toThrow(/length: 33/);
    expect(() => decodeEd25519PublicKey('not base64!')).toThrow(/must be base64-encoded/);
  });

  it('stays fast on a long run of padding', () => {
    const started = Date.now();
    expect(() => decodeEd25519PublicKey(`A${'='.repeat(100_000)}x`)).toThrow(/must be base64-encoded/);
    expect(() => decodeEd25519PublicKey('='.repeat(100_000))).toThrow(/must be base64-encoded/);
    expect(Date.now() - started).toBeLessThan(500);
  });

  it('builds and reads hint::fingerprint party IDs', () => {
    const { fingerprint } = createKey();
    expect(buildExternalPartyId('  alice ', fingerprint)).toBe(`alice::${fingerprint}`);
    expect(() => buildExternalPartyId(' ', fingerprint)).toThrow(/partyHint is required/);
    expect(() => buildExternalPartyId('a::b', fingerprint)).toThrow(/"::"/);
    expect(() => buildExternalPartyId('wallet:', fingerprint)).toThrow(/end with ":"/);
    expect(buildExternalPartyId(':wallet', fingerprint)).toBe(`:wallet::${fingerprint}`);
    expect(() => buildExternalPartyId('alice', fingerprint.toUpperCase())).toThrow(/publicKeyFingerprint/);
    expect(() => buildExternalPartyId('a'.repeat(186), fingerprint)).toThrow(/255 characters/);
    expect(buildExternalPartyId('a'.repeat(185), fingerprint)).toHaveLength(255);
    // Daml-LF Party characters only.
    expect(buildExternalPartyId('my app:1_x-y', fingerprint)).toBe(`my app:1_x-y::${fingerprint}`);
    for (const hint of ['my/app', 'wallet💰', 'café', 'a.b']) {
      expect(() => buildExternalPartyId(hint, fingerprint)).toThrow(/ASCII letters/);
    }

    expect(parseExternalPartyId(`alice::${fingerprint}`)).toEqual({ partyHint: 'alice', namespace: fingerprint });
    expect(readPartyNamespace(`alice::${fingerprint}`)).toBe(fingerprint);
    for (const invalid of ['alice', '::x', 'x::', 'a::b::c', 42, undefined]) {
      expect(parseExternalPartyId(invalid)).toBeNull();
      expect(readPartyNamespace(invalid)).toBeNull();
    }
  });

  it('is exported from the package root as the ExternalParties namespace', () => {
    expect(Root.ExternalParties.deriveCantonEd25519PublicKeyFingerprint).toBe(deriveCantonEd25519PublicKeyFingerprint);
    expect(typeof Root.ExternalParties.createExternalPartyDirectory).toBe('function');
    // The Node helpers of the same names stay at the root, unchanged.
    expect(Root.deriveCantonEd25519PublicKeyFingerprint).toBe(NodeProtocol.deriveCantonEd25519PublicKeyFingerprint);
  });
});
