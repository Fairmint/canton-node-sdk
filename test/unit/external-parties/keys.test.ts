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

  it('says which check refused a key', () => {
    expect(() => decodeEd25519PublicKey(SMALL_ORDER.toString('base64'))).toThrow(/small-order point is not safe/);
    expect(() => decodeEd25519PublicKey(FIELD_PRIME.toString('base64'))).toThrow(/not canonically encoded/);
    expect(() => decodeEd25519PublicKey(Buffer.alloc(33, 1).toString('base64'))).toThrow(/length: 33/);
    expect(() => decodeEd25519PublicKey('not base64!')).toThrow(/must be base64-encoded/);
  });

  it('builds and reads hint::fingerprint party IDs', () => {
    const { fingerprint } = createKey();
    expect(buildExternalPartyId('  alice ', fingerprint)).toBe(`alice::${fingerprint}`);
    expect(() => buildExternalPartyId(' ', fingerprint)).toThrow(/partyHint is required/);
    expect(() => buildExternalPartyId('a::b', fingerprint)).toThrow(/"::"/);
    expect(() => buildExternalPartyId('alice', fingerprint.toUpperCase())).toThrow(/publicKeyFingerprint/);
    expect(() => buildExternalPartyId('a'.repeat(187), fingerprint)).toThrow(/256 characters/);
    expect(buildExternalPartyId('a'.repeat(186), fingerprint)).toHaveLength(256);

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
