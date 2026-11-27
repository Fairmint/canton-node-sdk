/**
 * Node-sdk's wrappers over `@fairmint/canton-protocol/party` (internal): the rules are canton-protocol's, the errors
 * are the SDK's `ValidationError`, with canton-protocol's refusal as `cause`.
 */
import { isCantonProtocolError } from '@fairmint/canton-protocol/party';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { ValidationError } from '../../../src/core/errors';
import {
  assertPartyKey,
  cantonHashHexOf,
  cantonPublicKeyBase64,
  externalPartyIdOf,
  onCallerInput,
  publicKeyFingerprintOf,
  rawEd25519PublicKey,
} from '../../../src/utils/external-signing/party-identity';

// The Privy demo wallet's Solana key, raw and DER, and its Canton fingerprint.
const PRIVY_SOLANA_PUBLIC_KEY_BASE64 = 'vQ2OhTLJuhrZHGfWq+kSeMxAuHXLeryGhpe5bZ8eFd4=';
const PRIVY_SOLANA_DER_PUBLIC_KEY_BASE64 = 'MCowBQYDK2VwAyEAvQ2OhTLJuhrZHGfWq+kSeMxAuHXLeryGhpe5bZ8eFd4=';
const PRIVY_CANTON_FINGERPRINT = '12206f95ba6241f1719995e10f6b41f45be472e379ec1b2b9bf74fdee3bfa8204cb5';
const OTHER_FINGERPRINT = `1220${'00'.repeat(32)}`;

function thrown(call: () => unknown): unknown {
  try {
    call();
  } catch (error) {
    return error;
  }
  throw new Error('expected a throw');
}

/** An independent fingerprint: `1220` + hex(sha256(int32be(12) || rawKey)), through node:crypto. */
function nodeFingerprint(rawKey: Buffer): string {
  const purpose = Buffer.alloc(4);
  purpose.writeInt32BE(12);
  return `1220${createHash('sha256')
    .update(Buffer.concat([purpose, rawKey]))
    .digest('hex')}`;
}

describe('party identity (canton-protocol, SDK errors)', () => {
  it('normalizes and fingerprints the Privy demo wallet key, raw or DER', () => {
    expect(cantonPublicKeyBase64(PRIVY_SOLANA_PUBLIC_KEY_BASE64)).toBe(PRIVY_SOLANA_DER_PUBLIC_KEY_BASE64);
    expect(cantonPublicKeyBase64(PRIVY_SOLANA_DER_PUBLIC_KEY_BASE64)).toBe(PRIVY_SOLANA_DER_PUBLIC_KEY_BASE64);
    expect(Buffer.from(rawEd25519PublicKey(PRIVY_SOLANA_DER_PUBLIC_KEY_BASE64)).toString('base64')).toBe(
      PRIVY_SOLANA_PUBLIC_KEY_BASE64
    );
    expect(publicKeyFingerprintOf(PRIVY_SOLANA_PUBLIC_KEY_BASE64)).toBe(PRIVY_CANTON_FINGERPRINT);
    expect(publicKeyFingerprintOf(PRIVY_SOLANA_DER_PUBLIC_KEY_BASE64)).toBe(PRIVY_CANTON_FINGERPRINT);
  });

  it('fingerprints a random key as node:crypto computes it', () => {
    const raw = Buffer.from(generateKeyPairSync('ed25519').publicKey.export({ format: 'der', type: 'spki' })).subarray(
      -32
    );
    expect(publicKeyFingerprintOf(raw.toString('base64'))).toBe(nodeFingerprint(raw));
  });

  it('refuses malformed, non-canonical, small-order and wrong-length keys as ValidationError, with the cause', () => {
    const refused = [
      'not base64',
      Buffer.alloc(31, 1).toString('base64'),
      // The identity point (small order).
      Buffer.alloc(32).toString('base64'),
      // y >= p (non-canonical).
      Buffer.from(`ee${'ff'.repeat(30)}7f`, 'hex').toString('base64'),
    ];
    for (const key of refused) {
      for (const call of [
        () => cantonPublicKeyBase64(key),
        () => rawEd25519PublicKey(key),
        () => publicKeyFingerprintOf(key),
      ]) {
        const error = thrown(call);
        expect(error).toBeInstanceOf(ValidationError);
        expect(isCantonProtocolError((error as { cause?: unknown }).cause, 'INVALID_INPUT')).toBe(true);
      }
    }
    expect(() => publicKeyFingerprintOf(Buffer.alloc(31, 1).toString('base64'))).toThrow(
      'Invalid Ed25519 public key length'
    );
  });

  it('passes errors other than INVALID_INPUT through unchanged', () => {
    const error = new Error('boom');
    expect(
      thrown(() =>
        onCallerInput(() => {
          throw error;
        })
      )
    ).toBe(error);
  });

  it('builds hint::fingerprint party IDs and refuses a bad hint or fingerprint', () => {
    const partyId = externalPartyIdOf(' privy-test ', PRIVY_CANTON_FINGERPRINT);
    expect(partyId).toBe(`privy-test::${PRIVY_CANTON_FINGERPRINT}`);
    expect(() => externalPartyIdOf('bad::prefix', PRIVY_CANTON_FINGERPRINT)).toThrow(ValidationError);
    expect(() => externalPartyIdOf('bad::prefix', PRIVY_CANTON_FINGERPRINT)).toThrow('partyHint cannot include');
    expect(() => externalPartyIdOf('', PRIVY_CANTON_FINGERPRINT)).toThrow('partyHint is required');
    expect(() => externalPartyIdOf('privy-test', 'not-a-fingerprint')).toThrow(ValidationError);
    // Only the canonical (lowercase) fingerprint: an ID built from another spelling would not match the key's parties.
    expect(() => externalPartyIdOf('privy-test', PRIVY_CANTON_FINGERPRINT.toUpperCase())).toThrow(ValidationError);
  });

  it("checks a party ID against its key and a caller's fingerprint, returning the key's fingerprint", () => {
    const partyId = `privy-test::${PRIVY_CANTON_FINGERPRINT}`;
    expect(
      assertPartyKey({
        partyId,
        publicKeyBase64: PRIVY_SOLANA_PUBLIC_KEY_BASE64,
        publicKeyFingerprint: PRIVY_CANTON_FINGERPRINT,
      })
    ).toBe(PRIVY_CANTON_FINGERPRINT);
    expect(assertPartyKey({ partyId, publicKeyBase64: PRIVY_SOLANA_DER_PUBLIC_KEY_BASE64 })).toBe(
      PRIVY_CANTON_FINGERPRINT
    );
    expect(
      assertPartyKey({ partyId, publicKeyBase64: PRIVY_SOLANA_PUBLIC_KEY_BASE64, publicKeyFingerprint: null })
    ).toBe(PRIVY_CANTON_FINGERPRINT);

    expect(() =>
      assertPartyKey({ partyId: `privy-test::${OTHER_FINGERPRINT}`, publicKeyBase64: PRIVY_SOLANA_PUBLIC_KEY_BASE64 })
    ).toThrow('Canton party ID does not match the submitted public key');
    expect(() =>
      assertPartyKey({
        partyId,
        publicKeyBase64: PRIVY_SOLANA_PUBLIC_KEY_BASE64,
        publicKeyFingerprint: OTHER_FINGERPRINT,
      })
    ).toThrow('Submitted public key fingerprint does not match the public key');
    for (const invalid of [
      'privy-test',
      `::${PRIVY_CANTON_FINGERPRINT}`,
      'privy-test::',
      `a::b::${PRIVY_CANTON_FINGERPRINT}`,
    ]) {
      expect(() => assertPartyKey({ partyId: invalid, publicKeyBase64: PRIVY_SOLANA_PUBLIC_KEY_BASE64 })).toThrow(
        'Expected a Canton party ID with one public key fingerprint suffix'
      );
    }
    expect(() => assertPartyKey({ partyId, publicKeyBase64: Buffer.alloc(32).toString('base64') })).toThrow(
      ValidationError
    );
  });

  it('does not trim a party ID: whitespace around it or around its namespace is refused', () => {
    const partyId = `privy-test::${PRIVY_CANTON_FINGERPRINT}`;
    expect(assertPartyKey({ partyId, publicKeyBase64: PRIVY_SOLANA_PUBLIC_KEY_BASE64 })).toBe(PRIVY_CANTON_FINGERPRINT);
    // Space is a Daml-LF Party character: a leading space, or one before `::`, would otherwise parse as part of the
    // hint, with the key's fingerprint as the namespace.
    for (const untrimmed of [
      `${partyId} `,
      ` ${partyId}`,
      `  ${partyId}`,
      `privy-test ::${PRIVY_CANTON_FINGERPRINT}`,
      `privy-test:: ${PRIVY_CANTON_FINGERPRINT}`,
      `${partyId}\n`,
      `\t${partyId}`,
    ]) {
      expect(() => assertPartyKey({ partyId: untrimmed, publicKeyBase64: PRIVY_SOLANA_PUBLIC_KEY_BASE64 })).toThrow(
        'Canton party ID must not have whitespace around it or around its namespace'
      );
    }
    // Whitespace inside the hint is part of it, as Canton reads it.
    expect(
      assertPartyKey({
        partyId: `privy test::${PRIVY_CANTON_FINGERPRINT}`,
        publicKeyBase64: PRIVY_SOLANA_PUBLIC_KEY_BASE64,
      })
    ).toBe(PRIVY_CANTON_FINGERPRINT);
  });

  it('reads a caller-supplied Canton hash as hex only, in canonical form', () => {
    const hash = `1220${'ab'.repeat(32)}`;
    expect(cantonHashHexOf(` ${hash.toUpperCase()} `)).toBe(hash);
    for (const invalid of [
      Buffer.from(hash, 'hex').toString('base64'),
      `1221${'ab'.repeat(32)}`,
      `1220${'ab'.repeat(31)}`,
      '',
    ]) {
      expect(() => cantonHashHexOf(invalid)).toThrow('Expected a Canton SHA-256 multihash hex string');
    }
  });
});
