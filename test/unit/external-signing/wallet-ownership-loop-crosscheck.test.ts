/**
 * Cross-check for ENG-2832: a wallet ownership proof as Loop produces it, checked two ways.
 *
 * 1. The SDK's own check, `verifyWalletOwnership`.
 * 2. An apiv2-style check, written out here so this repository imports nothing from apiv2. It mirrors the key and
 *    signature part of apiv2's venue party proof (`verifyVenuePartyProof` in
 *    `services/onchain/canton/src/lib/venue/verification-link.ts`, with `assertCantonPartyMatchesPublicKey` from
 *    `packages/canton-wallet`): the party's namespace (after the last `::`) must be the Canton fingerprint of the
 *    base64-decoded key, and the Ed25519 signature (base64) must verify over the UTF-8 bytes of the message.
 *
 * The format bridge it documents: Loop reports its raw 32-byte key and its 64-byte signature as hex, and apiv2 takes
 * both as base64, so `Buffer.from(hex, 'hex').toString('base64')` is the whole conversion. Not covered, on purpose:
 * apiv2's venue proof also requires its message to be JSON in its own schema, and the SDK's canonical ownership message
 * is plain text, so the same signed text does not pass that schema. Which message format the FSA proof uses is an open
 * decision (ENG-2840); the last synthetic test pins the gap so it is not forgotten.
 *
 * The synthetic sample is generated the way Loop creates an external party (an Ed25519 key, and a party whose namespace
 * is that key's fingerprint). A real Loop DevNet sample goes in `fixtures/loop-devnet-ownership-proof.json` (see the
 * `.example.json` next to it); its tests run only when that file exists.
 */
import { createHash, createPublicKey, generateKeyPairSync, sign, verify } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { verifyWalletOwnership } from '../../../src/utils/external-signing';
import {
  parseWalletOwnershipMessage,
  proveWalletOwnership,
  type WalletOwnershipChallenge,
  type WalletOwnershipProof,
} from '../../../src/wallets/ownership';
import { accountProvider } from '../wallets/helpers';

/** The Canton fingerprint of a raw Ed25519 key: `1220` + SHA-256(int32 BE purpose 12 || raw key), written out here. */
function cantonFingerprint(rawKey: Buffer): string {
  const purpose = Buffer.alloc(4);
  purpose.writeInt32BE(12);
  return `1220${createHash('sha256').update(purpose).update(rawKey).digest('hex')}`;
}

type ApiStyleResult = { ok: true } | { ok: false; reason: 'bad-key' | 'party-key-mismatch' | 'bad-signature' };

/**
 * The apiv2-style check, inline: base64 key and signature, namespace after the last `::` equal to the key's
 * fingerprint, Ed25519 over the message's UTF-8 bytes (through a JWK, as apiv2 builds the key).
 */
function apiStyleCheck(input: {
  partyId: string;
  publicKeyBase64: string;
  message: string;
  signatureBase64: string;
}): ApiStyleResult {
  const rawKey = Buffer.from(input.publicKeyBase64, 'base64');
  if (rawKey.length !== 32) return { ok: false, reason: 'bad-key' };
  const separator = input.partyId.lastIndexOf('::');
  if (separator === -1 || input.partyId.slice(separator + 2) !== cantonFingerprint(rawKey)) {
    return { ok: false, reason: 'party-key-mismatch' };
  }
  try {
    const key = createPublicKey({
      key: { kty: 'OKP', crv: 'Ed25519', x: rawKey.toString('base64url') },
      format: 'jwk',
    });
    return verify(null, Buffer.from(input.message, 'utf8'), key, Buffer.from(input.signatureBase64, 'base64'))
      ? { ok: true }
      : { ok: false, reason: 'bad-signature' };
  } catch {
    return { ok: false, reason: 'bad-signature' };
  }
}

/** Loop's hex key and signature, converted to the base64 apiv2 takes. */
function toApiStyle(proof: WalletOwnershipProof): {
  partyId: string;
  publicKeyBase64: string;
  message: string;
  signatureBase64: string;
} {
  return {
    partyId: proof.partyId,
    publicKeyBase64: Buffer.from(proof.publicKey, 'hex').toString('base64'),
    message: proof.message,
    signatureBase64: Buffer.from(proof.signature, 'hex').toString('base64'),
  };
}

const HEX_KEY = /^[0-9a-fA-F]{64}$/;
const HEX_SIGNATURE = /^[0-9a-fA-F]{128}$/;

describe('Loop wallet ownership proof cross-check (synthetic sample)', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const rawKey = Buffer.from(publicKey.export({ format: 'jwk' }).x ?? '', 'base64url');
  const namespace = cantonFingerprint(rawKey);
  const partyId = `loop-holder::${namespace}`;
  const challenge: WalletOwnershipChallenge = {
    domain: 'explorer.example.com',
    nonce: 'eng-2832-crosscheck-nonce',
    issuedAt: '2026-11-19T12:00:00.000Z',
    expiresAt: '2026-11-19T12:05:00.000Z',
    network: 'canton:devnet',
  };

  /** A proof as Loop would return it: CIP-0103 signMessage over the canonical text, hex key and hex signature. */
  async function loopProof(): Promise<WalletOwnershipProof> {
    const provider = accountProvider({
      party: partyId,
      account: { publicKey: rawKey.toString('hex'), namespace },
      signMessage: (message) => ({ signature: sign(null, Buffer.from(message, 'utf8'), privateKey).toString('hex') }),
    });
    return proveWalletOwnership(
      { provider, partyId, network: 'devnet' },
      { challenge, now: () => new Date('2026-11-19T12:00:30.000Z') }
    );
  }

  it('produces Loop-shaped output: a hex raw key, a hex signature, and a party namespaced by the key', async () => {
    const proof = await loopProof();
    expect(proof.publicKey).toMatch(HEX_KEY);
    expect(proof.signature).toMatch(HEX_SIGNATURE);
    expect(proof.partyId.slice(proof.partyId.lastIndexOf('::') + 2)).toBe(namespace);
  });

  it('verifies with verifyWalletOwnership', async () => {
    const proof = await loopProof();
    expect(
      verifyWalletOwnership(proof, {
        expectedNonce: challenge.nonce,
        expectedDomain: challenge.domain,
        expectedNetwork: 'canton:devnet',
        expectedPartyId: partyId,
        now: new Date('2026-11-19T12:01:00.000Z'),
      })
    ).toMatchObject({ verified: true, partyId, publicKeyFingerprint: namespace });
  });

  it('passes the apiv2-style check once the hex key and signature are converted to base64', async () => {
    expect(apiStyleCheck(toApiStyle(await loopProof()))).toEqual({ ok: true });
  });

  it('fails the apiv2-style check when the hex is passed unconverted, so the conversion is required', async () => {
    const proof = await loopProof();
    expect(
      apiStyleCheck({
        partyId: proof.partyId,
        publicKeyBase64: proof.publicKey,
        message: proof.message,
        signatureBase64: proof.signature,
      })
    ).toEqual({ ok: false, reason: 'bad-key' });
  });

  it('fails the apiv2-style check for an altered message or another party', async () => {
    const converted = toApiStyle(await loopProof());
    expect(apiStyleCheck({ ...converted, message: `${converted.message} ` })).toEqual({
      ok: false,
      reason: 'bad-signature',
    });
    expect(apiStyleCheck({ ...converted, partyId: `loop-holder::1220${'0'.repeat(64)}` })).toEqual({
      ok: false,
      reason: 'party-key-mismatch',
    });
  });

  it("is not JSON, so apiv2's venue proof schema would refuse the SDK canonical message (format still open, ENG-2840)", async () => {
    const proof = await loopProof();
    expect(() => JSON.parse(proof.message) as unknown).toThrow(SyntaxError);
  });
});

// The real Loop DevNet sample (ENG-2832). Optional: the tests are defined only when the file exists.
const REAL_SAMPLE_PATH = join(__dirname, 'fixtures', 'loop-devnet-ownership-proof.json');

if (existsSync(REAL_SAMPLE_PATH)) {
  describe('Loop wallet ownership proof cross-check (real Loop DevNet sample)', () => {
    const sample = JSON.parse(readFileSync(REAL_SAMPLE_PATH, 'utf8')) as WalletOwnershipProof;
    const fields = parseWalletOwnershipMessage(sample.message);

    it('is a canonical ownership message with a hex raw key and a hex signature, as Loop is expected to return', () => {
      expect(fields).not.toBeNull();
      expect(sample.publicKey).toMatch(HEX_KEY);
      expect(sample.signature).toMatch(HEX_SIGNATURE);
    });

    it("has a party namespace equal to the key's Canton fingerprint", () => {
      const namespace = sample.partyId.slice(sample.partyId.lastIndexOf('::') + 2);
      expect(namespace).toBe(cantonFingerprint(Buffer.from(sample.publicKey, 'hex')));
    });

    it('verifies with verifyWalletOwnership (checked at its issue time)', () => {
      if (fields === null) throw new Error('The sample message is not a canonical ownership message');
      expect(
        verifyWalletOwnership(sample, {
          expectedNonce: fields.nonce,
          expectedDomain: fields.domain,
          expectedPartyId: sample.partyId,
          now: new Date(fields.issuedAt),
        })
      ).toMatchObject({ verified: true, partyId: sample.partyId });
    });

    it('passes the apiv2-style check after hex to base64 conversion', () => {
      expect(apiStyleCheck(toApiStyle(sample))).toEqual({ ok: true });
    });
  });
}
