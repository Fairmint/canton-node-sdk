import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { ValidationError } from '../../../src/core/errors';
import {
  assertCantonPrepareToken,
  assertEd25519Signature,
  buildCantonPrepareToken,
  canonicalizeCantonProtocolPayload,
  deriveSolanaAddressFromEd25519PublicKeyBase64,
  hashCantonProtocolPayload,
  hashHexToBase64,
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
  it('derives the Solana address used by the Privy demo wallet, and refuses a key canton-protocol refuses', () => {
    expect(deriveSolanaAddressFromEd25519PublicKeyBase64(PRIVY_SOLANA_PUBLIC_KEY_BASE64)).toBe(PRIVY_SOLANA_ADDRESS);
    expect(deriveSolanaAddressFromEd25519PublicKeyBase64(PRIVY_SOLANA_DER_PUBLIC_KEY_BASE64)).toBe(
      PRIVY_SOLANA_ADDRESS
    );
    expect(() => deriveSolanaAddressFromEd25519PublicKeyBase64(Buffer.alloc(32).toString('base64'))).toThrow(
      ValidationError
    );
  });

  it('converts Canton hashes from hex to base64', () => {
    const base64 = Buffer.from(SAMPLE_CANTON_HASH_HEX, 'hex').toString('base64');
    expect(hashHexToBase64(SAMPLE_CANTON_HASH_HEX)).toBe(base64);
    expect(() => hashHexToBase64('abc')).toThrow('hex-encoded Canton hash');
  });

  it('verifies Ed25519 signatures over raw payloads', () => {
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
    expect(() =>
      assertEd25519Signature({
        publicKeyBase64: fixture.rawPublicKeyBase64,
        payload,
        signatureBase64: fixture.signPayload(Buffer.from('wrong payload')),
      })
    ).toThrow('Invalid Ed25519 signature');
    expect(() =>
      assertEd25519Signature({
        publicKeyBase64: fixture.rawPublicKeyBase64,
        payload,
        signatureBase64: 'not*base64',
      })
    ).toThrow('signatureBase64 must be base64-encoded');
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
});
