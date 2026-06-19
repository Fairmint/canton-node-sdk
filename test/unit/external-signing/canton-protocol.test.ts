import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { ValidationError } from '../../../src/core/errors';
import {
  assertCantonHashSignature,
  assertCantonPartyMatchesPublicKey,
  assertCantonPrepareToken,
  assertEd25519Signature,
  buildCantonPrepareToken,
  buildExternalPartyId,
  canonicalizeCantonProtocolPayload,
  deriveCantonEd25519PublicKeyFingerprint,
  deriveSolanaAddressFromEd25519PublicKeyBase64,
  extractPublicKeyFingerprint,
  extractRawEd25519PublicKey,
  hashCantonProtocolPayload,
  hashHexToBase64,
  hashPreparedTransaction,
  normalizeCantonHashToHex,
  normalizeEd25519PublicKeyForCanton,
  preparedTransactionHashToHex,
} from '../../../src/utils/external-signing/canton-protocol';

const PRIVY_SOLANA_PUBLIC_KEY_BASE64 = 'vQ2OhTLJuhrZHGfWq+kSeMxAuHXLeryGhpe5bZ8eFd4=';
const PRIVY_SOLANA_DER_PUBLIC_KEY_BASE64 = 'MCowBQYDK2VwAyEAvQ2OhTLJuhrZHGfWq+kSeMxAuHXLeryGhpe5bZ8eFd4=';
const PRIVY_SOLANA_ADDRESS = 'Diz3ajBkuNFDNYsCXwitEopUqzm8gwYkhjgLTuv5rrqK';
const PRIVY_CANTON_FINGERPRINT = '12206f95ba6241f1719995e10f6b41f45be472e379ec1b2b9bf74fdee3bfa8204cb5';
const SAMPLE_CANTON_HASH_HEX = `1220${'ab'.repeat(32)}`;

const createSigningFixture = (): {
  readonly rawPublicKeyBase64: string;
  readonly derPublicKeyBase64: string;
  readonly signPayload: (payload: Buffer) => string;
} => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const derPublicKey = Buffer.from(publicKey.export({ format: 'der', type: 'spki' }));
  return {
    rawPublicKeyBase64: derPublicKey.subarray(-32).toString('base64'),
    derPublicKeyBase64: derPublicKey.toString('base64'),
    signPayload: (payload: Buffer) => sign(null, payload, privateKey).toString('base64'),
  };
};

describe('Canton protocol helpers', () => {
  it('normalizes raw Privy/Solana Ed25519 public keys into Canton DER form', () => {
    expect(normalizeEd25519PublicKeyForCanton(PRIVY_SOLANA_PUBLIC_KEY_BASE64)).toBe(PRIVY_SOLANA_DER_PUBLIC_KEY_BASE64);
    expect(normalizeEd25519PublicKeyForCanton(PRIVY_SOLANA_DER_PUBLIC_KEY_BASE64)).toBe(
      PRIVY_SOLANA_DER_PUBLIC_KEY_BASE64
    );
    expect(extractRawEd25519PublicKey(PRIVY_SOLANA_DER_PUBLIC_KEY_BASE64).toString('base64')).toBe(
      PRIVY_SOLANA_PUBLIC_KEY_BASE64
    );
  });

  it('derives the Solana address and Canton fingerprint used by the Privy demo wallet', () => {
    expect(deriveSolanaAddressFromEd25519PublicKeyBase64(PRIVY_SOLANA_PUBLIC_KEY_BASE64)).toBe(PRIVY_SOLANA_ADDRESS);
    expect(deriveCantonEd25519PublicKeyFingerprint(PRIVY_SOLANA_PUBLIC_KEY_BASE64)).toBe(PRIVY_CANTON_FINGERPRINT);
  });

  it('rejects malformed, non-canonical, and wrong-length Ed25519 public keys', () => {
    expect(() => extractRawEd25519PublicKey('not base64')).toThrow(ValidationError);
    expect(() => extractRawEd25519PublicKey(Buffer.alloc(31, 1).toString('base64'))).toThrow(
      'Invalid Ed25519 public key length'
    );
    expect(() => extractRawEd25519PublicKey(Buffer.alloc(32).toString('base64'))).toThrow('Invalid Ed25519 public key');
    expect(() => extractRawEd25519PublicKey(Buffer.from(`ee${'ff'.repeat(30)}7f`, 'hex').toString('base64'))).toThrow(
      'Invalid Ed25519 public key'
    );
  });

  it('builds and validates party ids bound to public-key fingerprints', () => {
    const partyId = buildExternalPartyId('privy-test', PRIVY_CANTON_FINGERPRINT);
    expect(partyId).toBe(`privy-test::${PRIVY_CANTON_FINGERPRINT}`);
    expect(extractPublicKeyFingerprint(partyId)).toBe(PRIVY_CANTON_FINGERPRINT);
    expect(
      assertCantonPartyMatchesPublicKey({
        partyId,
        publicKeyBase64: PRIVY_SOLANA_PUBLIC_KEY_BASE64,
        publicKeyFingerprint: PRIVY_CANTON_FINGERPRINT,
      })
    ).toBe(PRIVY_CANTON_FINGERPRINT);

    expect(() => buildExternalPartyId('bad::prefix', PRIVY_CANTON_FINGERPRINT)).toThrow('partyHint cannot include');
    expect(() => buildExternalPartyId('privy-test', 'not-a-fingerprint')).toThrow(
      'Expected a Canton SHA-256 multihash hex string'
    );
    expect(buildExternalPartyId('privy-test', PRIVY_CANTON_FINGERPRINT.toUpperCase())).toBe(partyId);
    expect(() =>
      assertCantonPartyMatchesPublicKey({
        partyId: `privy-test::1220${'00'.repeat(32)}`,
        publicKeyBase64: PRIVY_SOLANA_PUBLIC_KEY_BASE64,
      })
    ).toThrow('Canton party ID does not match');
  });

  it('normalizes Canton hashes from hex, base64, and base64url', () => {
    const base64 = Buffer.from(SAMPLE_CANTON_HASH_HEX, 'hex').toString('base64');
    const base64Url = Buffer.from(SAMPLE_CANTON_HASH_HEX, 'hex').toString('base64url');

    expect(normalizeCantonHashToHex(SAMPLE_CANTON_HASH_HEX.toUpperCase())).toBe(SAMPLE_CANTON_HASH_HEX);
    expect(normalizeCantonHashToHex(base64)).toBe(SAMPLE_CANTON_HASH_HEX);
    expect(normalizeCantonHashToHex(base64Url)).toBe(SAMPLE_CANTON_HASH_HEX);
    expect(hashHexToBase64(SAMPLE_CANTON_HASH_HEX)).toBe(base64);
    expect(() => normalizeCantonHashToHex(Buffer.from('bad').toString('base64'))).toThrow('valid SHA-256 multihash');
    expect(() => hashHexToBase64('abc')).toThrow('hex-encoded Canton hash');
  });

  it('verifies Ed25519 signatures over raw payloads and Canton hashes', () => {
    const fixture = createSigningFixture();
    const payload = Buffer.from('Canton external party approval', 'utf8');
    const signatureBase64 = fixture.signPayload(payload);
    assertEd25519Signature({
      publicKeyBase64: fixture.rawPublicKeyBase64,
      payload,
      signatureBase64,
    });
    assertEd25519Signature({
      publicKeyBase64: fixture.derPublicKeyBase64,
      payload,
      signatureBase64,
    });

    const hashSignature = fixture.signPayload(Buffer.from(SAMPLE_CANTON_HASH_HEX, 'hex'));
    assertCantonHashSignature({
      publicKeyBase64: fixture.rawPublicKeyBase64,
      hashHex: SAMPLE_CANTON_HASH_HEX,
      signatureBase64: hashSignature,
    });
    expect(() =>
      assertCantonHashSignature({
        publicKeyBase64: fixture.rawPublicKeyBase64,
        hashHex: SAMPLE_CANTON_HASH_HEX,
        signatureBase64: fixture.signPayload(Buffer.from('wrong payload')),
      })
    ).toThrow('Invalid Canton hash signature');
  });

  it('canonicalizes and hashes protocol payloads deterministically', () => {
    expect(
      canonicalizeCantonProtocolPayload({
        z: 1,
        undefinedValue: undefined,
        nested: { b: true, a: 'first' },
        list: [{ y: 2, x: 1 }],
      })
    ).toBe('{"list":[{"x":1,"y":2}],"nested":{"a":"first","b":true},"z":1}');
    expect(hashCantonProtocolPayload({ b: 2, a: 1 })).toBe(
      createHash('sha256').update('{"a":1,"b":2}', 'utf8').digest('hex')
    );
    expect(() => canonicalizeCantonProtocolPayload({ value: Number.NaN })).toThrow('non-finite');
    expect(() => canonicalizeCantonProtocolPayload({ value: () => true })).toThrow('unsupported value');
  });

  it('binds prepare tokens to exactly the expected payload', () => {
    const secret = 'test-secret';
    const payload = { partyId: `privy-test::${PRIVY_CANTON_FINGERPRINT}`, amount: '5' };
    const token = buildCantonPrepareToken(secret, payload);

    expect(() => assertCantonPrepareToken(secret, token, payload)).not.toThrow();
    expect(() => buildCantonPrepareToken('   ', payload)).toThrow('Prepare token secret is required');
    expect(() => assertCantonPrepareToken('', token, payload)).toThrow('Prepare token secret is required');
    expect(() => assertCantonPrepareToken(secret, token, { ...payload, amount: '6' })).toThrow(
      'does not match the submitted details'
    );
    expect(() => assertCantonPrepareToken('wrong-secret', token, payload)).toThrow(
      'does not match the submitted details'
    );
  });

  it('hashes prepared transaction blobs and converts prepared transaction hashes from base64', () => {
    const preparedTransaction = 'prepared-transaction-base64';
    const preparedHash = Buffer.from('interactive-hash');

    expect(hashPreparedTransaction(preparedTransaction)).toBe(
      createHash('sha256').update(preparedTransaction).digest('hex')
    );
    expect(preparedTransactionHashToHex(preparedHash.toString('base64'))).toBe(preparedHash.toString('hex'));
    expect(preparedTransactionHashToHex(preparedHash.toString('base64url'))).toBe(preparedHash.toString('hex'));
    expect(() => preparedTransactionHashToHex('not base64!')).toThrow('valid prepared hash');
  });
});
