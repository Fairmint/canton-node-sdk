/**
 * Node-sdk's internal check of a signature over a Canton hash (canton-protocol's `verifyCantonHashSignature`, awaited,
 * failing closed): a signature that verifies resolves; one that does not, malformed input, and a platform without
 * Ed25519 all reject.
 */
import { CantonProtocolError, isCantonProtocolError } from '@fairmint/canton-protocol/signature';
import { generateKeyPairSync, sign } from 'node:crypto';
import { ValidationError } from '../../../src/core/errors';
import { assertCantonHashSigned, isSignedHashHex } from '../../../src/utils/external-signing/hash-signature';
import { expectSignatureRefused, REFUSED_SIGNATURES } from './fixtures/hash-signatures';

const CANTON_HASH_HEX = `1220${'ab'.repeat(32)}`;
const PREPARED_HASH_HEX = 'cd'.repeat(32);

const createKey = (): {
  readonly rawPublicKeyBase64: string;
  readonly derPublicKeyBase64: string;
  readonly signHex: (hex: string) => string;
} => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const der = Buffer.from(publicKey.export({ format: 'der', type: 'spki' }));
  return {
    rawPublicKeyBase64: der.subarray(-32).toString('base64'),
    derPublicKeyBase64: der.toString('base64'),
    signHex: (hex) => sign(null, Buffer.from(hex, 'hex'), privateKey).toString('base64'),
  };
};

describe('assertCantonHashSigned', () => {
  it.each([
    ['a 34-byte Canton hash', CANTON_HASH_HEX],
    ['a 32-byte prepared-transaction hash', PREPARED_HASH_HEX],
  ])(
    'resolves for a valid signature over %s, with a raw or DER key and any base64 spelling',
    async (_name, hashHex) => {
      const key = createKey();
      const signature = key.signHex(hashHex);
      for (const publicKeyBase64 of [key.rawPublicKeyBase64, key.derPublicKeyBase64]) {
        for (const signatureBase64 of [
          signature,
          signature.replace(/=+$/, ''),
          signature.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
          ` ${signature}\n`,
        ]) {
          await expect(assertCantonHashSigned({ publicKeyBase64, hashHex, signatureBase64 })).resolves.toBeUndefined();
        }
      }
      await expect(
        assertCantonHashSigned({
          publicKeyBase64: key.rawPublicKeyBase64,
          hashHex: ` ${hashHex.toUpperCase()} `,
          signatureBase64: signature,
        })
      ).resolves.toBeUndefined();
    }
  );

  it.each(REFUSED_SIGNATURES)('refuses a signature $name', async (refusal) => {
    const key = createKey();
    const signatureBase64 = refusal.make({
      valid: key.signHex(CANTON_HASH_HEX),
      otherKey: createKey().signHex(CANTON_HASH_HEX),
    });
    await expectSignatureRefused(
      assertCantonHashSigned({ publicKeyBase64: key.rawPublicKeyBase64, hashHex: CANTON_HASH_HEX, signatureBase64 }),
      refusal
    );
  });

  it('refuses a signature over another hash, with the caller’s message', async () => {
    const key = createKey();
    await expect(
      assertCantonHashSigned({
        publicKeyBase64: key.rawPublicKeyBase64,
        hashHex: CANTON_HASH_HEX,
        signatureBase64: key.signHex(`1220${'ac'.repeat(32)}`),
        failureMessage: 'Signer returned a bad signature',
      })
    ).rejects.toThrow(new ValidationError('Signer returned a bad signature'));
  });

  it.each([
    ['not hex', 'zz'.repeat(32)],
    ['16 bytes', 'ab'.repeat(16)],
    ['33 bytes', 'ab'.repeat(33)],
    ['34 bytes without the 1220 prefix', `1221${'ab'.repeat(32)}`],
    ['base64', Buffer.from(CANTON_HASH_HEX, 'hex').toString('base64')],
    ['empty', ''],
  ])('refuses a hash that is %s before verifying', async (_name, hashHex) => {
    const key = createKey();
    expect(isSignedHashHex(hashHex)).toBe(false);
    await expect(
      assertCantonHashSigned({
        publicKeyBase64: key.rawPublicKeyBase64,
        hashHex,
        signatureBase64: key.signHex(CANTON_HASH_HEX),
      })
    ).rejects.toThrow(ValidationError);
  });

  it('refuses a public key canton-protocol refuses (a small-order point), with its refusal as cause', async () => {
    const key = createKey();
    let error: unknown;
    try {
      await assertCantonHashSigned({
        publicKeyBase64: Buffer.alloc(32).toString('base64'),
        hashHex: CANTON_HASH_HEX,
        signatureBase64: key.signHex(CANTON_HASH_HEX),
      });
    } catch (caught: unknown) {
      error = caught;
    }
    expect(error).toBeInstanceOf(ValidationError);
    expect(isCantonProtocolError((error as { cause?: unknown }).cause, 'INVALID_INPUT')).toBe(true);
  });

  it('rejects, never resolves, when WebCrypto cannot verify Ed25519 (UNSUPPORTED passes through)', async () => {
    const key = createKey();
    const notSupported = Object.assign(new Error('Ed25519 is not supported'), { name: 'NotSupportedError' });
    const verify = jest.spyOn(globalThis.crypto.subtle, 'verify').mockRejectedValueOnce(notSupported);
    try {
      const refused = assertCantonHashSigned({
        publicKeyBase64: key.rawPublicKeyBase64,
        hashHex: CANTON_HASH_HEX,
        signatureBase64: key.signHex(CANTON_HASH_HEX),
      });
      await expect(refused).rejects.toBeInstanceOf(CantonProtocolError);
      await expect(refused).rejects.toMatchObject({ code: 'UNSUPPORTED' });
      expect(verify).toHaveBeenCalledTimes(1);
    } finally {
      verify.mockRestore();
    }
  });
});
