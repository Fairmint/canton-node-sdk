/**
 * `verifyWalletProof`: the server check of the compact wallet proof message, apiv2's CNTN tokenization format. Proofs
 * are signed the way Loop signs (hex key and signature) and the way Privy's provider does (base64 DER key, base64
 * signature).
 */
import { fingerprintEd25519PublicKey } from '@fairmint/canton-protocol/party';
import { generateKeyPairSync, sign, type KeyObject } from 'node:crypto';
import {
  verifyWalletProof,
  type VerifyWalletProofArgs,
  type WalletProofVerification,
} from '../../../src/utils/external-signing';
import { buildWalletProofMessage, type WalletProofFields } from '../../../src/wallets/wallet-proof';

interface PartyKey {
  readonly privateKey: KeyObject;
  readonly publicKeyHex: string;
  readonly publicKeyDerBase64: string;
  readonly namespace: string;
  readonly partyId: string;
}

function externalParty(hint = 'alice'): PartyKey {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const der = publicKey.export({ format: 'der', type: 'spki' });
  const raw = der.subarray(der.length - 32);
  const namespace = fingerprintEd25519PublicKey(raw.toString('base64'));
  return {
    privateKey,
    publicKeyHex: raw.toString('hex'),
    publicKeyDerBase64: der.toString('base64'),
    namespace,
    partyId: `${hint}::${namespace}`,
  };
}

const party = externalParty();
const DOMAIN = 'fairmint:tokenization-wallet-proof:v1';
const NOW = new Date('2026-11-24T10:01:00.000Z');

const fieldsFor = (key: PartyKey = party, change: Partial<WalletProofFields> = {}): WalletProofFields => ({
  domain: DOMAIN,
  network: 'devnet',
  partyId: key.partyId,
  investorContext: 'investor-42',
  idempotencyKey: 'idem-7',
  issuedAt: '2026-11-24T10:00:00.000Z',
  expiresAt: '2026-11-24T10:05:00.000Z',
  ...change,
});

function loopProof(
  change: Partial<WalletProofFields> = {},
  key: PartyKey = party,
  signer: PartyKey = key
): { partyId: string; publicKey: string; message: string; signature: string } {
  const message = buildWalletProofMessage(fieldsFor(key, change));
  return {
    partyId: key.partyId,
    publicKey: key.publicKeyHex,
    message,
    signature: sign(null, Buffer.from(message, 'utf8'), signer.privateKey).toString('hex'),
  };
}

const expected = { domain: DOMAIN, network: 'devnet', partyId: party.partyId } as const;

const verify = (args: Partial<VerifyWalletProofArgs> = {}): WalletProofVerification =>
  verifyWalletProof({ proof: loopProof(), expected, now: NOW, ...args });

const reasonOf = (result: WalletProofVerification): string | undefined => (result.verified ? undefined : result.reason);

describe('verifyWalletProof', () => {
  it('verifies a proof Loop signed, returning the message fields and the key fingerprint', () => {
    expect(verify()).toEqual({ verified: true, ...fieldsFor(), publicKeyFingerprint: party.namespace });
  });

  it("verifies a proof in Privy's encoding (base64 DER key, base64 signature)", () => {
    const message = buildWalletProofMessage(fieldsFor());
    const proof = {
      partyId: party.partyId,
      publicKey: party.publicKeyDerBase64,
      message,
      signature: sign(null, Buffer.from(message, 'utf8'), party.privateKey).toString('base64'),
    };
    expect(verify({ proof }).verified).toBe(true);
  });

  it('verifies a proof whose message apiv2 built with JSON.stringify, with an offset timestamp', () => {
    const fields = fieldsFor(party, { issuedAt: '2026-11-24T11:00:00+01:00', expiresAt: '2026-11-24T11:05:00+01:00' });
    const message = JSON.stringify(fields);
    const proof = {
      partyId: party.partyId,
      publicKey: party.publicKeyHex,
      message,
      signature: sign(null, Buffer.from(message, 'utf8'), party.privateKey).toString('hex'),
    };
    expect(verify({ proof })).toMatchObject({ verified: true, issuedAt: fields.issuedAt });
  });

  it('checks investorContext and idempotencyKey when expected', () => {
    const full = { ...expected, investorContext: 'investor-42', idempotencyKey: 'idem-7' };
    expect(verify({ expected: full }).verified).toBe(true);
    expect(reasonOf(verify({ expected: { ...full, investorContext: 'investor-43' } }))).toBe(
      'investor-context-mismatch'
    );
    expect(reasonOf(verify({ expected: { ...full, idempotencyKey: 'idem-8' } }))).toBe('idempotency-key-mismatch');
  });

  it('checks the exact window when the server issued it', () => {
    const window = { issuedAt: '2026-11-24T10:00:00.000Z', expiresAt: '2026-11-24T10:05:00.000Z' };
    expect(verify({ expected: { ...expected, ...window } }).verified).toBe(true);
    expect(reasonOf(verify({ expected: { ...expected, ...window, expiresAt: '2026-11-24T10:04:00.000Z' } }))).toBe(
      'window-mismatch'
    );
  });

  it.each([
    ['another domain', { expected: { ...expected, domain: 'fairmint:other:v1' } }, 'domain-mismatch'],
    ['another network', { expected: { ...expected, network: 'mainnet' as const } }, 'network-mismatch'],
    ['another expected party', { expected: { ...expected, partyId: externalParty('bob').partyId } }, 'party-mismatch'],
    ['a proof that is not an object', { proof: 'nope' }, 'malformed-proof'],
    ['a proof without a signature', { proof: { ...loopProof(), signature: 7 } }, 'malformed-proof'],
    [
      'the text ownership message',
      { proof: { ...loopProof(), message: 'Canton wallet ownership proof' } },
      'malformed-message',
    ],
    [
      'a pretty-printed message',
      { proof: { ...loopProof(), message: JSON.stringify(fieldsFor(), null, 2) } },
      'malformed-message',
    ],
    [
      'a message for another party than the proof',
      { proof: { ...loopProof(), partyId: externalParty('bob').partyId } },
      'party-mismatch',
    ],
    ["a namespace that is not the party's", { proof: { ...loopProof(), namespace: '1220ff' } }, 'party-mismatch'],
  ])('refuses %s', (_name, args, reason) => {
    expect(reasonOf(verify(args as Partial<VerifyWalletProofArgs>))).toBe(reason);
  });

  it('refuses a message issued more than the skew in the future, expired, or valid for too long', () => {
    expect(reasonOf(verify({ now: new Date('2026-11-24T09:59:00.000Z') }))).toBeUndefined();
    expect(reasonOf(verify({ now: new Date('2026-11-24T09:58:59.999Z') }))).toBe('not-yet-valid');
    expect(reasonOf(verify({ now: new Date('2026-11-24T09:58:00.000Z'), maxSkewMs: 120_000 }))).toBeUndefined();
    expect(reasonOf(verify({ now: new Date('2026-11-24T10:05:00.000Z') }))).toBe('expired');
    expect(reasonOf(verify({ now: new Date('2026-11-24T10:04:59.999Z') }))).toBeUndefined();
    const long = loopProof({ expiresAt: '2026-11-24T10:10:00.001Z' });
    expect(reasonOf(verify({ proof: long }))).toBe('lifetime-too-long');
    expect(reasonOf(verify({ proof: loopProof({ expiresAt: '2026-11-24T10:10:00.000Z' }) }))).toBeUndefined();
    expect(reasonOf(verify({ maxLifetimeMs: 60_000 }))).toBe('lifetime-too-long');
  });

  it('refuses a key that does not derive the party, and a signature by another key', () => {
    const other = externalParty('bob');
    const swappedKey = { ...loopProof(), publicKey: other.publicKeyHex };
    expect(reasonOf(verify({ proof: swappedKey }))).toBe('key-not-bound-to-party');
    expect(reasonOf(verify({ proof: loopProof({}, party, other) }))).toBe('bad-signature');
    expect(reasonOf(verify({ proof: { ...loopProof(), signature: 'zz' } }))).toBe('malformed-signature');
    expect(reasonOf(verify({ proof: { ...loopProof(), publicKey: 'not a key' } }))).toBe('unsupported-public-key');
  });

  it('never echoes the submitted values in its messages', () => {
    const result = verify({ expected: { ...expected, investorContext: 'secret-account' } });
    expect(result.verified).toBe(false);
    if (!result.verified) expect(result.message).not.toContain('investor-42');
  });

  it('throws TypeError for an expectation without domain, network or party, or a bad bound', () => {
    expect(() => verify({ expected: { ...expected, domain: '' } })).toThrow('expected.domain is required');
    expect(() => verify({ expected: { ...expected, partyId: '' } })).toThrow('expected.partyId is required');
    expect(() => verify({ expected: { ...expected, network: 'canton:devnet' as never } })).toThrow(
      'expected.network must be devnet or mainnet'
    );
    expect(() => verify({ maxLifetimeMs: 0 })).toThrow(TypeError);
    expect(() => verify({ now: new Date(Number.NaN) })).toThrow(TypeError);
  });
});
