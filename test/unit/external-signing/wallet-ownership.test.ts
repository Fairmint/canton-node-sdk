import { fingerprintEd25519PublicKey } from '@fairmint/canton-protocol/party';
import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import {
  verifyWalletOwnership,
  type VerifyWalletOwnershipOptions,
  type WalletOwnershipFailure,
} from '../../../src/utils/external-signing';
import { checkKeyAndSignature } from '../../../src/utils/external-signing/wallet-ownership-checks';
import {
  buildWalletOwnershipMessage,
  proveWalletOwnership,
  type WalletOwnershipChallenge,
} from '../../../src/wallets/ownership';
import { accountProvider } from '../wallets/helpers';

/** An Ed25519 key and the external party it namespaces, as Loop creates them. */
function externalParty(hint = 'alice'): {
  privateKey: KeyObject;
  rawHex: string;
  rawBase64: string;
  derBase64: string;
  partyId: string;
  namespace: string;
} {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const der = publicKey.export({ format: 'der', type: 'spki' });
  const raw = der.subarray(der.length - 32);
  const namespace = fingerprintEd25519PublicKey(raw.toString('base64'));
  return {
    privateKey,
    rawHex: raw.toString('hex'),
    rawBase64: raw.toString('base64'),
    derBase64: der.toString('base64'),
    partyId: `${hint}::${namespace}`,
    namespace,
  };
}

const CHALLENGE: WalletOwnershipChallenge = {
  domain: 'explorer.example.com',
  nonce: 'n0nce-0123456789abcdef',
  issuedAt: '2026-11-16T12:00:00.000Z',
  expiresAt: '2026-11-16T12:05:00.000Z',
  network: 'canton:devnet',
};
const OPTIONS: VerifyWalletOwnershipOptions = {
  expectedNonce: CHALLENGE.nonce,
  expectedDomain: CHALLENGE.domain,
  expectedNetwork: 'canton:devnet',
  now: new Date('2026-11-16T12:01:00.000Z'),
};

const party = externalParty();

/** The party's key as a PEM SubjectPublicKeyInfo, rebuilt from its DER. */
const publicKeyPem = (key: { derBase64: string }): string =>
  `-----BEGIN PUBLIC KEY-----\n${key.derBase64}\n-----END PUBLIC KEY-----`;
const HOSTED_NS = '1220'.padEnd(68, 'e');
const HOSTED = `bob::${HOSTED_NS}`;

/** A proof signed like Loop's wallet: Ed25519 over the UTF-8 message, hex signature, hex raw public key. */
function loopProof(
  fields: Partial<WalletOwnershipChallenge & { partyId: string }> = {},
  key = party
): { partyId: string; publicKey: string; namespace: string; message: string; signature: string } {
  const message = buildWalletOwnershipMessage({ ...CHALLENGE, partyId: key.partyId, ...fields });
  return {
    partyId: fields.partyId ?? key.partyId,
    publicKey: key.rawHex,
    namespace: key.namespace,
    message,
    signature: sign(null, Buffer.from(message, 'utf8'), key.privateKey).toString('hex'),
  };
}

describe('verifyWalletOwnership', () => {
  it('verifies a Loop-style proof (hex key, hex signature) end to end through proveWalletOwnership', async () => {
    const provider = accountProvider({
      party: party.partyId,
      account: { publicKey: party.rawHex, namespace: party.namespace },
      signMessage: (message) => ({
        signature: sign(null, Buffer.from(message, 'utf8'), party.privateKey).toString('hex'),
      }),
    });
    const proof = await proveWalletOwnership(
      { provider, partyId: party.partyId, network: 'devnet' },
      {
        challenge: CHALLENGE,
        now: () => new Date('2026-11-16T12:00:30.000Z'),
      }
    );
    expect(verifyWalletOwnership(proof, { ...OPTIONS, expectedPartyId: party.partyId })).toEqual({
      verified: true,
      partyId: party.partyId,
      publicKeyFingerprint: party.namespace,
      domain: CHALLENGE.domain,
      nonce: CHALLENGE.nonce,
      network: 'canton:devnet',
      issuedAt: CHALLENGE.issuedAt,
      expiresAt: CHALLENGE.expiresAt,
    });
  });

  it.each([
    ['upper-case hex', party.rawHex.toUpperCase()],
    ['raw base64 (Privy)', party.rawBase64],
    ['DER SubjectPublicKeyInfo base64', party.derBase64],
  ])('accepts a public key as %s', (_label, publicKey) => {
    expect(verifyWalletOwnership({ ...loopProof(), publicKey }, OPTIONS)).toMatchObject({ verified: true });
  });

  it.each([
    ['PEM', () => publicKeyPem(party)],
    ['DER SubjectPublicKeyInfo hex', () => Buffer.from(party.derBase64, 'base64').toString('hex')],
    ['0x-prefixed hex', () => `0x${party.rawHex}`],
  ])('refuses a public key as %s', (_label, publicKey) => {
    expect(verifyWalletOwnership({ ...loopProof(), publicKey: publicKey() }, OPTIONS)).toMatchObject({
      verified: false,
      reason: 'unsupported-public-key',
    });
  });

  it('accepts a base64 signature (Privy), and refuses a 0x-prefixed hex one', () => {
    const proof = loopProof();
    const bytes = Buffer.from(proof.signature, 'hex');
    expect(verifyWalletOwnership({ ...proof, signature: bytes.toString('base64') }, OPTIONS).verified).toBe(true);
    expect(verifyWalletOwnership({ ...proof, signature: `0x${proof.signature}` }, OPTIONS)).toMatchObject({
      verified: false,
      reason: 'malformed-signature',
    });
  });

  it('needs no namespace in the proof', () => {
    const { namespace: _namespace, ...proof } = loopProof();
    expect(verifyWalletOwnership(proof, OPTIONS).verified).toBe(true);
  });

  const other = externalParty('mallory');

  const refusals: Array<[string, () => unknown, WalletOwnershipFailure]> = [
    ['not an object', () => 'proof', 'malformed-proof'],
    ['a field that is not a string', () => ({ ...loopProof(), signature: 7 }), 'malformed-proof'],
    ['a non-canonical message', () => ({ ...loopProof(), message: `${loopProof().message}\n` }), 'malformed-message'],
    [
      'an out-of-range date (month 13) instead of throwing',
      () => {
        const proof = loopProof();
        return {
          ...proof,
          message: proof.message.replace(/Expiration Time: \d{4}-\d{2}/, (m) => `${m.slice(0, -2)}13`),
        };
      },
      'malformed-message',
    ],
    ['another domain', () => loopProof({ domain: 'evil.example.com' }), 'domain-mismatch'],
    ['another nonce', () => loopProof({ nonce: 'other-nonce-0123456789' }), 'nonce-mismatch'],
    ['another network', () => loopProof({ network: 'canton:mainnet' }), 'network-mismatch'],
    [
      'a message without a network',
      () => {
        const { network: _network, ...challenge } = CHALLENGE;
        const message = buildWalletOwnershipMessage({ ...challenge, partyId: party.partyId });
        return {
          ...loopProof(),
          message,
          signature: sign(null, Buffer.from(message), party.privateKey).toString('hex'),
        };
      },
      'network-mismatch',
    ],
    ['a message naming another party', () => ({ ...loopProof(), partyId: other.partyId }), 'party-mismatch'],
    ['another namespace', () => ({ ...loopProof(), namespace: other.namespace }), 'party-mismatch'],
    [
      'an issue time in the future',
      () => loopProof({ issuedAt: '2026-11-16T12:03:00.000Z', expiresAt: '2026-11-16T12:06:00.000Z' }),
      'not-yet-valid',
    ],
    [
      'an expired message',
      () => loopProof({ issuedAt: '2026-11-16T11:55:00.000Z', expiresAt: '2026-11-16T12:00:59.999Z' }),
      'expired',
    ],
    [
      'a validity window over ten minutes',
      () => loopProof({ issuedAt: '2026-11-16T12:00:00.000Z', expiresAt: '2026-11-16T13:00:00.000Z' }),
      'lifetime-too-long',
    ],
    ['a key that is not Ed25519', () => ({ ...loopProof(), publicKey: 'ab'.repeat(33) }), 'unsupported-public-key'],
    ['a small-order key', () => ({ ...loopProof(), publicKey: '00'.repeat(32) }), 'unsupported-public-key'],
    // Signed by the key it presents, but that key does not namespace the party (a spoofed party id).
    [
      "another party's key",
      () => {
        const proof = loopProof({}, other);
        const message = buildWalletOwnershipMessage({ ...CHALLENGE, partyId: party.partyId });
        return {
          ...proof,
          partyId: party.partyId,
          namespace: party.namespace,
          message,
          signature: sign(null, Buffer.from(message), other.privateKey).toString('hex'),
        };
      },
      'key-not-bound-to-party',
    ],
    // A participant-hosted party: the reference gateway sends the participant's namespace in place of a key.
    [
      'a participant-hosted party whose public key is its namespace',
      () => ({ ...loopProof({ partyId: HOSTED }), namespace: HOSTED_NS, publicKey: HOSTED_NS }),
      'unsupported-public-key',
    ],
    [
      'a participant-hosted party signed by a key that is not its namespace',
      () => ({ ...loopProof({ partyId: HOSTED }), namespace: HOSTED_NS }),
      'key-not-bound-to-party',
    ],
    [
      'a truncated signature',
      () => ({ ...loopProof(), signature: loopProof().signature.slice(2) }),
      'malformed-signature',
    ],
    [
      'a signature over another message',
      () => ({ ...loopProof(), signature: loopProof({ nonce: 'other-nonce-0123456789' }).signature }),
      'bad-signature',
    ],
  ];
  it('refuses a message whose validity window is not the one the server issued', () => {
    const issued = { expectedIssuedAt: CHALLENGE.issuedAt, expectedExpiresAt: CHALLENGE.expiresAt };
    expect(verifyWalletOwnership(loopProof(), { ...OPTIONS, ...issued }).verified).toBe(true);
    for (const fields of [{ issuedAt: '2026-11-16T12:00:30.000Z' }, { expiresAt: '2026-11-16T12:04:00.000Z' }]) {
      expect(verifyWalletOwnership(loopProof(fields), { ...OPTIONS, ...issued })).toMatchObject({
        verified: false,
        reason: 'window-mismatch',
      });
    }
  });

  it.each(refusals)('refuses %s', (_label, proof, reason) => {
    const result = verifyWalletOwnership(proof(), OPTIONS);
    expect(result).toMatchObject({ verified: false, reason });
    expect(result.verified ? '' : result.message.length).toBeGreaterThan(0);
  });

  it('refuses a key that does not namespace the party it signed for', () => {
    // A key whose own message is honest, for a party some other key namespaces.
    const unbound = { ...party, partyId: `alice::${other.namespace}` };
    const proof = loopProof({}, unbound);
    expect(verifyWalletOwnership({ ...proof, namespace: other.namespace }, OPTIONS)).toMatchObject({
      verified: false,
      reason: 'key-not-bound-to-party',
    });
  });

  it('does not trim the party ID a proof names', () => {
    // The key and a valid signature over the message, with only the party ID untrimmed.
    const proof = loopProof();
    expect(checkKeyAndSignature(proof)).toEqual({ fingerprint: party.namespace });
    const [hint, namespace] = party.partyId.split('::') as [string, string];
    // A leading space, or one before `::`, would otherwise parse as part of the hint (space is a Daml-LF character).
    for (const untrimmed of [
      `${party.partyId} `,
      ` ${party.partyId}`,
      `${hint} ::${namespace}`,
      `${hint}:: ${namespace}`,
      `${party.partyId}\n`,
    ]) {
      expect(checkKeyAndSignature({ ...proof, partyId: untrimmed })).toMatchObject({
        verified: false,
        reason: 'party-mismatch',
      });
    }
    // The message refuses an untrimmed ID before any check, so a proof naming one never verifies.
    expect(() => loopProof({ partyId: `${party.partyId} ` })).toThrow(TypeError);
  });

  it('refuses a proof for another party than expected', () => {
    expect(verifyWalletOwnership(loopProof(), { ...OPTIONS, expectedPartyId: other.partyId })).toMatchObject({
      verified: false,
      reason: 'party-mismatch',
    });
  });

  it('takes the expected nonce from the caller, not from the proof', () => {
    expect(() => verifyWalletOwnership(loopProof(), { ...OPTIONS, expectedNonce: '' })).toThrow(TypeError);
    expect(() => verifyWalletOwnership(loopProof(), { ...OPTIONS, expectedDomain: '' })).toThrow(TypeError);
  });
});
