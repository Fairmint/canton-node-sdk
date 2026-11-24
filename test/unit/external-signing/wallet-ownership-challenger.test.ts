/**
 * The server half of a wallet ownership check (challenge token, nonce store, verdict, host binding, request bodies),
 * and a round trip through the browser half (`requestWalletOwnershipVerdict`) with a proof signed the way Loop signs:
 * Ed25519 over the UTF-8 message, hex key and signature. Moved from the canton-explorer route tests, with their
 * fixtures. The `wallet-proof-v1` format (a server-built wallet proof message) is tested last.
 */
import { createHmac, generateKeyPairSync, randomBytes, sign, type KeyObject } from 'node:crypto';
import {
  createMemoryNonceStore,
  createWalletOwnershipChallenger,
  DEFAULT_WALLET_OWNERSHIP_CHALLENGE_TTL_MS,
  deriveCantonEd25519PublicKeyFingerprint,
  walletOwnershipDomain,
  type WalletOwnershipChallenger,
  type WalletOwnershipChallengerOptions,
  type WalletOwnershipNonceStore,
  type WalletOwnershipVerdict,
  type WalletProofChallengeResponse,
} from '../../../src/utils/external-signing';
import { cip103NetworkId } from '../../../src/wallets/cip103';
import type { FetchLike } from '../../../src/wallets/da-utilities/client';
import {
  buildWalletOwnershipMessage,
  requestWalletOwnershipVerdict,
  type RequestWalletOwnershipVerdictOptions,
  type WalletOwnershipChallenge,
  type WalletOwnershipChallengeResponse,
} from '../../../src/wallets/ownership';
import { buildWalletProofMessage } from '../../../src/wallets/wallet-proof';
import { accountProvider, type RecordingProvider } from '../wallets/helpers';

const SECRET = 'wallet-ownership-unit-test-secret';
const PURPOSE = 'canton-explorer:wallet-ownership-challenge:v1';
const DOMAIN = 'dapp.example.com';
const ORIGIN = `https://${DOMAIN}`;
const SUB = 'staff-sub-1';
const NOW = new Date('2026-11-16T12:00:00.000Z');
const LATER = new Date(NOW.getTime() + 30_000);

interface PartyKey {
  readonly privateKey: KeyObject;
  readonly publicKeyHex: string;
  readonly namespace: string;
  readonly partyId: string;
}

/** A Loop-style external party: its namespace is the fingerprint of its Ed25519 key. */
function externalParty(hint = 'alice'): PartyKey {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const der = publicKey.export({ format: 'der', type: 'spki' });
  const raw = der.subarray(der.length - 32);
  const namespace = deriveCantonEd25519PublicKeyFingerprint(raw.toString('base64'));
  return { privateKey, publicKeyHex: raw.toString('hex'), namespace, partyId: `${hint}::${namespace}` };
}
const party = externalParty();

const signHex = (privateKey: KeyObject, message: string): string =>
  sign(null, Buffer.from(message, 'utf8'), privateKey).toString('hex');

function loopProof(
  challenge: WalletOwnershipChallenge,
  key: PartyKey = party
): { partyId: string; publicKey: string; namespace: string; message: string; signature: string } {
  const message = buildWalletOwnershipMessage({ ...challenge, partyId: key.partyId });
  return {
    partyId: key.partyId,
    publicKey: key.publicKeyHex,
    namespace: key.namespace,
    message,
    signature: signHex(key.privateKey, message),
  };
}

interface VerifyOverrides {
  readonly subject?: string;
  readonly domain?: string;
  /** When the proof arrives; LATER by default. */
  readonly at?: Date;
}

interface Setup {
  readonly challenger: WalletOwnershipChallenger;
  readonly issue: (partyId?: string) => WalletOwnershipChallengeResponse;
  readonly verify: (token: unknown, proof: unknown, overrides?: VerifyOverrides) => Promise<WalletOwnershipVerdict>;
}

/** A challenger on a clock the test sets, issuing at NOW. */
function setup(options: Partial<WalletOwnershipChallengerOptions> = {}): Setup {
  const clock = { now: NOW };
  const challenger = createWalletOwnershipChallenger({
    secret: SECRET,
    purpose: PURPOSE,
    now: () => clock.now,
    ...options,
  });
  const issue = (partyId = party.partyId): WalletOwnershipChallengeResponse =>
    challenger.issue({ subject: SUB, domain: DOMAIN, network: 'devnet', partyId });
  const verify = async (
    token: unknown,
    proof: unknown,
    overrides: VerifyOverrides = {}
  ): Promise<WalletOwnershipVerdict> => {
    clock.now = overrides.at ?? LATER;
    return challenger.verify({
      token,
      proof,
      subject: overrides.subject ?? SUB,
      domain: overrides.domain ?? DOMAIN,
    });
  };
  return { challenger, issue, verify };
}

const reasonOf = (verdict: WalletOwnershipVerdict): string | undefined =>
  verdict.verified ? undefined : verdict.reason;

describe('createWalletOwnershipChallenger: issue and verify', () => {
  it('issues a challenge naming the host, the network and a five-minute window', () => {
    const { issue } = setup();
    const { challenge, token } = issue();
    expect(challenge.domain).toBe(DOMAIN);
    expect(challenge.network).toBe('canton:devnet');
    expect(cip103NetworkId('mainnet')).toBe('canton:mainnet');
    expect(challenge.issuedAt).toBe(NOW.toISOString());
    expect(Date.parse(challenge.expiresAt) - NOW.getTime()).toBe(DEFAULT_WALLET_OWNERSHIP_CHALLENGE_TTL_MS);
    expect(DEFAULT_WALLET_OWNERSHIP_CHALLENGE_TTL_MS).toBe(5 * 60 * 1000);
    expect(challenge.nonce).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(issue().challenge.nonce).not.toBe(challenge.nonce);
    expect(token).toMatch(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  });

  it('verifies a proof Loop signed for the challenge', async () => {
    const { issue, verify } = setup();
    const { challenge, token } = issue();
    await expect(verify(token, loopProof(challenge))).resolves.toEqual({
      verified: true,
      partyId: party.partyId,
      publicKeyFingerprint: party.namespace,
      claimedNetwork: 'canton:devnet',
      verifiedAt: LATER.toISOString(),
    });
  });

  it('keeps the token format and key derivation: v1.<claims>.<HMAC under HMAC-SHA256(secret, purpose)>', async () => {
    // A token MACed exactly as the explorer's route did before the move still verifies.
    const challenge = {
      domain: DOMAIN,
      nonce: randomBytes(24).toString('base64url'),
      issuedAt: NOW.toISOString(),
      expiresAt: new Date(NOW.getTime() + DEFAULT_WALLET_OWNERSHIP_CHALLENGE_TTL_MS).toISOString(),
      network: 'canton:devnet',
    };
    const body = Buffer.from(JSON.stringify({ ...challenge, partyId: party.partyId, sub: SUB })).toString('base64url');
    const key = createHmac('sha256', SECRET).update(PURPOSE).digest();
    const token = `v1.${body}.${createHmac('sha256', key).update(`v1.${body}`).digest('base64url')}`;
    const { verify, issue } = setup();
    await expect(verify(token, loopProof(challenge))).resolves.toMatchObject({ verified: true });

    const issued = issue().token.split('.')[1] ?? '';
    expect(Object.keys(JSON.parse(Buffer.from(issued, 'base64url').toString('utf8')))).toEqual([
      'domain',
      'nonce',
      'issuedAt',
      'expiresAt',
      'network',
      'partyId',
      'sub',
    ]);
  });

  it('accepts each challenge once, whatever the first verdict', async () => {
    const { issue, verify } = setup();
    const { challenge, token } = issue();
    const bad = { ...loopProof(challenge), signature: 'ab'.repeat(64) };
    expect(reasonOf(await verify(token, bad))).toBe('bad-signature');
    await expect(verify(token, loopProof(challenge))).resolves.toEqual({
      verified: false,
      reason: 'challenge-used',
      message: 'The challenge was already used. Each one is accepted once.',
    });
  });

  it('forgets a spent nonce once its challenge expired (memory store)', () => {
    const spent = createMemoryNonceStore();
    expect(spent.spend('n', 1_000, 0)).toBe(true);
    expect(spent.spend('n', 1_000, 999)).toBe(false);
    expect(spent.spend('n', 2_000, 1_000)).toBe(true);
  });

  it('spends the nonce in a pluggable store, before the signature, with the challenge expiry', async () => {
    const calls: Array<[string, number, number]> = [];
    const nonceStore: WalletOwnershipNonceStore = {
      spend: async (nonce, expiresAtMs, nowMs) => {
        calls.push([nonce, expiresAtMs, nowMs]);
        return calls.length === 1;
      },
    };
    const { issue, verify } = setup({ nonceStore });
    const { challenge, token } = issue();
    expect(reasonOf(await verify(token, 'not a proof'))).toBe('malformed-proof');
    expect(reasonOf(await verify(token, loopProof(challenge)))).toBe('challenge-used');
    expect(calls).toEqual([
      [challenge.nonce, Date.parse(challenge.expiresAt), LATER.getTime()],
      [challenge.nonce, Date.parse(challenge.expiresAt), LATER.getTime()],
    ]);
  });

  it('refuses a token it did not MAC before looking at the signature or spending a nonce', async () => {
    const spend = jest.fn(() => true);
    const { issue, verify } = setup({ nonceStore: { spend } });
    const { challenge, token } = issue();
    const proof = loopProof(challenge);
    const [version, body, mac] = token.split('.') as [string, string, string];
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Record<string, string>;
    const forged = Buffer.from(JSON.stringify({ ...claims, partyId: 'mallory::1220ff' })).toString('base64url');
    for (const candidate of [
      `${version}.${forged}.${mac}`,
      `${token}.extra`,
      `v2.${body}.${mac}`,
      'not-a-token',
      '',
      `${token}${'x'.repeat(4096)}`,
      7,
      undefined,
    ]) {
      await expect(verify(candidate, proof)).resolves.toEqual({
        verified: false,
        reason: 'challenge-invalid',
        message: 'The challenge was not issued by this server.',
      });
    }
    for (const other of [{ secret: 'another-secret' }, { purpose: 'another-purpose' }]) {
      expect(reasonOf(await setup(other).verify(token, proof))).toBe('challenge-invalid');
    }
    expect(spend).not.toHaveBeenCalled();
    // The same secret as bytes is the same key.
    expect(reasonOf(await setup({ secret: new TextEncoder().encode(SECRET) }).verify(token, proof))).toBeUndefined();
  });

  it('refuses a message whose validity window differs from the issued one', async () => {
    const { issue, verify } = setup();
    const { challenge, token } = issue();
    const proof = loopProof({ ...challenge, expiresAt: new Date(NOW.getTime() + 60_000).toISOString() });
    expect(reasonOf(await verify(token, proof))).toBe('window-mismatch');
  });

  it('binds a challenge to the subject and the host', async () => {
    const { issue, verify } = setup();
    const { challenge, token } = issue();
    const proof = loopProof(challenge);
    for (const overrides of [{ subject: 'someone-else' }, { domain: 'evil.example' }]) {
      await expect(verify(token, proof, overrides)).resolves.toEqual({
        verified: false,
        reason: 'challenge-not-yours',
        message: 'The challenge was issued to another session, party or host.',
      });
    }
  });

  it('refuses an expired challenge', async () => {
    const { issue, verify } = setup();
    const { challenge, token } = issue();
    const at = new Date(NOW.getTime() + DEFAULT_WALLET_OWNERSHIP_CHALLENGE_TTL_MS);
    expect(reasonOf(await verify(token, loopProof(challenge), { at }))).toBe('challenge-expired');
  });

  it('does not verify a proof for another party than the challenge named', async () => {
    const { issue, verify } = setup();
    const { challenge, token } = issue(party.partyId);
    expect(reasonOf(await verify(token, loopProof(challenge, externalParty('bob'))))).toBe('party-mismatch');
  });

  it('does not verify a spoofed party id (key not its namespace)', async () => {
    const victim = externalParty('victim');
    const attacker = externalParty('attacker');
    const { issue, verify } = setup();
    const { challenge, token } = issue(victim.partyId);
    // The attacker signs a message naming the victim's party with its own key.
    const proof = loopProof(challenge, { ...attacker, partyId: victim.partyId, namespace: victim.namespace });
    expect(reasonOf(await verify(token, proof))).toBe('key-not-bound-to-party');
  });

  it('uses the TTL as the challenge window and the verifier maxAgeMs', async () => {
    const { issue, verify } = setup({ ttlMs: 60_000 });
    const { challenge, token } = issue();
    expect(Date.parse(challenge.expiresAt) - NOW.getTime()).toBe(60_000);
    expect(reasonOf(await verify(token, loopProof(challenge)))).toBeUndefined();
  });

  it('refuses invalid options and challenge fields with TypeError', () => {
    expect(() => createWalletOwnershipChallenger({ secret: '', purpose: PURPOSE })).toThrow(TypeError);
    expect(() => createWalletOwnershipChallenger({ secret: new Uint8Array(), purpose: PURPOSE })).toThrow(TypeError);
    expect(() => createWalletOwnershipChallenger({ secret: SECRET, purpose: '' })).toThrow(TypeError);
    expect(() => createWalletOwnershipChallenger({ secret: SECRET, purpose: PURPOSE, ttlMs: 0 })).toThrow(TypeError);
    const { challenger } = setup();
    const args = { subject: SUB, domain: DOMAIN, network: 'devnet' as const, partyId: party.partyId };
    for (const bad of [
      { partyId: 'no-namespace' },
      { partyId: 'a b::1220' },
      { domain: 'evil.example/path' },
      { subject: '' },
      { network: 'localnet' },
    ]) {
      expect(() => challenger.issue({ ...args, ...bad } as typeof args)).toThrow(TypeError);
    }
  });
});

describe('walletOwnershipDomain', () => {
  const url = 'http://localhost:3000/api/wallet-ownership/challenge';
  const at = (headers: Record<string, string>, on = url): string | null =>
    walletOwnershipDomain(new Request(on, { headers }), [ORIGIN]);

  it('takes the Origin host only when the server names it, never a forwarded host', () => {
    expect(at({ origin: 'http://localhost:3000' })).toBe('localhost:3000');
    expect(at({ origin: 'https://DApp.Example.com' })).toBe(DOMAIN);
    // No Origin (a non-browser caller), an opaque one, or a host this server does not serve.
    expect(at({})).toBeNull();
    expect(at({ 'x-forwarded-host': 'localhost:3000' })).toBeNull();
    expect(at({ origin: 'null' })).toBeNull();
    expect(at({ origin: 'https://evil.example', 'x-forwarded-host': 'evil.example' })).toBeNull();
    expect(at({ origin: 'http://localhost:3001' })).toBeNull();
    expect(at({ origin: 'not a url' })).toBeNull();
    // Without trusted origins, only the request's own host.
    expect(walletOwnershipDomain(new Request(url, { headers: { origin: ORIGIN } }))).toBeNull();
  });

  it('throws on a trusted origin that is not an absolute URL instead of refusing every caller', () => {
    const request = new Request(url, { headers: { origin: 'http://localhost:3000' } });
    expect(() => walletOwnershipDomain(request, ['dapp.example.com'])).toThrow(
      new TypeError('trustedOrigins entry "dapp.example.com" is not an absolute URL (https://host)')
    );
    // Also without an Origin: the misconfiguration shows on the first request, whoever sends it.
    expect(() => walletOwnershipDomain(new Request(url), [ORIGIN, 'nope'])).toThrow(TypeError);
  });
});

/** The routes as a same-origin page reaches them. */
function post(path: string, body: string, origin: string | null = ORIGIN): Request {
  return new Request(`${ORIGIN}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(origin !== null && { origin }) },
    body,
  });
}

interface Answer {
  readonly status: number;
  readonly cache: string | null;
  readonly json: unknown;
}

async function answer(response: Response): Promise<Answer> {
  return { status: response.status, cache: response.headers.get('cache-control'), json: await response.json() };
}

describe('createWalletOwnershipChallenger: handlers', () => {
  it('answers a challenge request with { data } and refuses bad bodies with 400 { error }, all no-store', async () => {
    const { challenger } = setup();
    const handle = async (body: string, origin?: string | null): Promise<Answer> =>
      answer(await challenger.handleChallenge(post('/challenge', body, origin), { subject: SUB }));

    const ok = await handle(JSON.stringify({ network: 'devnet', partyId: party.partyId }));
    expect(ok).toMatchObject({ status: 200, cache: 'no-store' });
    expect((ok.json as { data: { challenge: WalletOwnershipChallenge } }).data.challenge).toMatchObject({
      domain: DOMAIN,
      network: 'canton:devnet',
    });

    for (const [body, error] of [
      ['{', 'Invalid JSON request body'],
      ['', 'Invalid JSON request body'],
      ['null', 'Expected a JSON object.'],
      ['[]', 'Expected a JSON object.'],
      [JSON.stringify({ network: 'localnet', partyId: party.partyId }), 'network must be devnet or mainnet.'],
      [JSON.stringify({ network: 'devnet' }), 'partyId must be a Canton party id (hint::namespace).'],
      [
        JSON.stringify({ network: 'devnet', partyId: 'no-namespace' }),
        'partyId must be a Canton party id (hint::namespace).',
      ],
      [
        JSON.stringify({ network: 'devnet', partyId: 'a b::1220' }),
        'partyId must be a Canton party id (hint::namespace).',
      ],
    ] as const) {
      await expect(handle(body)).resolves.toEqual({ status: 400, cache: 'no-store', json: { error } });
    }
    // A CLI caller (no Origin) cannot bind the message to a host it names.
    const valid = JSON.stringify({ network: 'devnet', partyId: party.partyId });
    for (const origin of [null, 'https://evil.example']) {
      await expect(handle(valid, origin)).resolves.toEqual({
        status: 400,
        cache: 'no-store',
        json: { error: "Ownership checks accept only requests from this site's own pages." },
      });
    }
  });

  it('answers a verify request with the verdict and refuses a body that is not a token and a proof', async () => {
    const { challenger, issue } = setup();
    const onVerdict = jest.fn();
    const handle = async (body: unknown, origin?: string | null): Promise<Answer> =>
      answer(
        await challenger.handleVerify(post('/verify', JSON.stringify(body), origin), {
          subject: SUB,
          trustedOrigins: [ORIGIN],
          onVerdict,
        })
      );
    const { challenge, token } = issue();
    const proof = loopProof(challenge);

    for (const [body, error] of [
      [null, 'Expected a JSON object.'],
      [{ proof }, 'token must be the challenge token.'],
      [{ token: '', proof }, 'token must be the challenge token.'],
      [{ token: 'x'.repeat(4097), proof }, 'token must be the challenge token.'],
      [{ token: 'v1.a.b' }, 'proof must be an object.'],
      [{ token, proof: 'signed' }, 'proof must be an object.'],
      [{ token, proof: [] }, 'proof must be an object.'],
    ] as const) {
      await expect(handle(body)).resolves.toEqual({ status: 400, cache: 'no-store', json: { error } });
    }
    expect(onVerdict).not.toHaveBeenCalled();

    // A proof object of the wrong field types is a verdict (the verifier reads it), and spends the challenge.
    await expect(handle({ token, proof: { ...proof, signature: 7 } })).resolves.toMatchObject({
      status: 200,
      cache: 'no-store',
      json: { data: { verified: false, reason: 'malformed-proof' } },
    });
    expect(onVerdict).toHaveBeenLastCalledWith(expect.objectContaining({ reason: 'malformed-proof' }), party.partyId);
    await expect(handle({ token, proof })).resolves.toMatchObject({
      status: 200,
      json: { data: { verified: false, reason: 'challenge-used' } },
    });

    // Unknown proof fields are ignored; the logged party is the token's, never the unparsed proof's.
    const fresh = issue();
    await expect(
      handle({ token: fresh.token, proof: { ...loopProof(fresh.challenge), extra: 1 } })
    ).resolves.toMatchObject({
      status: 200,
      json: { data: { verified: true, partyId: party.partyId } },
    });
    await handle({ token: 'not-a-token', proof: { ...proof, partyId: 'mallory::1220ff' } });
    expect(onVerdict).toHaveBeenLastCalledWith(expect.objectContaining({ reason: 'challenge-invalid' }), null);
  });
});

describe('requestWalletOwnershipVerdict through the handlers', () => {
  const CHALLENGE_URL = '/api/wallet-ownership/challenge';
  const VERIFY_URL = '/api/wallet-ownership/verify';

  /** A same-origin `fetch` that serves both routes from the challenger in memory. */
  function routes(
    challenger = createWalletOwnershipChallenger({ secret: SECRET, purpose: PURPOSE }),
    origin: string = ORIGIN
  ): { fetch: FetchLike; verdicts: Array<[WalletOwnershipVerdict, string | null]> } {
    const verdicts: Array<[WalletOwnershipVerdict, string | null]> = [];
    const fetch: FetchLike = async (url, init) => {
      const request = new Request(`${ORIGIN}${url}`, {
        method: init.method,
        headers: { ...init.headers, origin },
        ...(init.body !== undefined && { body: init.body }),
      });
      return url === CHALLENGE_URL
        ? challenger.handleChallenge(request, { subject: SUB })
        : challenger.handleVerify(request, {
            subject: SUB,
            onVerdict: (verdict, partyId) => verdicts.push([verdict, partyId]),
          });
    };
    return { fetch, verdicts };
  }

  /** A devnet connection of `key`'s party whose wallet signs with `signer`, as Loop signs (hex). */
  function loopWallet(
    key: PartyKey = party,
    signer: PartyKey = key
  ): { provider: RecordingProvider; partyId: string; network: 'devnet' } {
    const provider = accountProvider({
      party: key.partyId,
      account: { publicKey: key.publicKeyHex, namespace: key.namespace },
      signMessage: (message) => ({ signature: signHex(signer.privateKey, message) }),
    });
    return { provider, partyId: key.partyId, network: 'devnet' };
  }

  const options = (fetch: FetchLike): RequestWalletOwnershipVerdictOptions => ({
    fetch,
    challengeUrl: CHALLENGE_URL,
    verifyUrl: VERIFY_URL,
  });

  it('proves ownership through both routes', async () => {
    const { fetch, verdicts } = routes();
    const wallet = loopWallet();
    const verdict = await requestWalletOwnershipVerdict(wallet, options(fetch));
    expect(verdict).toMatchObject({
      verified: true,
      partyId: party.partyId,
      publicKeyFingerprint: party.namespace,
      claimedNetwork: 'canton:devnet',
    });
    expect(verdicts).toEqual([[verdict, party.partyId]]);
    const signed = wallet.provider.requests.flatMap((r) => (r.method === 'signMessage' ? [r.params.message] : []));
    expect(signed).toHaveLength(1);
    expect(signed[0]).toMatch(/^Canton wallet ownership proof\n/);
    expect(signed[0]).toMatch(/\nDomain: dapp\.example\.com\n/);
    expect(signed[0]).toMatch(/\nNetwork: canton:devnet\n/);
  });

  it('returns a not-verified verdict for a wallet signing with another key', async () => {
    const { fetch } = routes();
    await expect(
      requestWalletOwnershipVerdict(loopWallet(party, externalParty('other')), options(fetch))
    ).resolves.toMatchObject({ verified: false, reason: 'bad-signature' });
  });

  it('throws when the server refuses, naming its error, and signs nothing', async () => {
    const { fetch } = routes(undefined, 'https://evil.example');
    const wallet = loopWallet();
    await expect(requestWalletOwnershipVerdict(wallet, options(fetch))).rejects.toThrow(
      "The server refused the ownership check: Ownership checks accept only requests from this site's own pages."
    );
    const unavailable: FetchLike = async () => ({ ok: false, status: 503, text: async () => 'Service Unavailable' });
    await expect(requestWalletOwnershipVerdict(wallet, options(unavailable))).rejects.toThrow(
      'The server refused the ownership check: HTTP 503'
    );
    const noData: FetchLike = async () => ({ ok: true, status: 200, text: async () => '{}' });
    await expect(requestWalletOwnershipVerdict(wallet, options(noData))).rejects.toThrow(
      'The server refused the ownership check: HTTP 200'
    );
    expect(wallet.provider.requests.some((r) => r.method === 'signMessage')).toBe(false);
  });

  it('throws on a malformed verdict, or a verified one for another party', async () => {
    const challenger = createWalletOwnershipChallenger({ secret: SECRET, purpose: PURPOSE });
    const answering =
      (verdict: unknown): FetchLike =>
      async (url) => {
        const data =
          url === CHALLENGE_URL
            ? challenger.issue({ subject: SUB, domain: DOMAIN, partyId: party.partyId, network: 'devnet' })
            : verdict;
        return { ok: true, status: 200, text: async () => JSON.stringify({ data }) };
      };
    const malformed = [
      { verified: false },
      { verified: false, reason: 'bad-signature' },
      { verified: true, partyId: party.partyId },
      {
        verified: true,
        partyId: 'mallory::1220ff',
        publicKeyFingerprint: party.namespace,
        claimedNetwork: 'canton:devnet',
        verifiedAt: '2026-11-16T00:00:00.000Z',
      },
      'yes',
    ];
    for (const verdict of malformed) {
      await expect(requestWalletOwnershipVerdict(loopWallet(), options(answering(verdict)))).rejects.toThrow(
        'The server answered the ownership proof without a well-formed verdict for the party'
      );
    }
    await expect(
      requestWalletOwnershipVerdict(
        loopWallet(),
        options(answering({ verified: false, reason: 'bad-signature', message: 'The signature does not verify.' }))
      )
    ).resolves.toEqual({ verified: false, reason: 'bad-signature', message: 'The signature does not verify.' });
  });

  it('refuses to sign a challenge for another network than it asked for', async () => {
    const challenger = createWalletOwnershipChallenger({ secret: SECRET, purpose: PURPOSE });
    const mainnet: FetchLike = async () => {
      const issued = challenger.issue({ subject: SUB, domain: DOMAIN, partyId: party.partyId, network: 'mainnet' });
      return { ok: true, status: 200, text: async () => JSON.stringify({ data: issued }) };
    };
    const wallet = loopWallet();
    await expect(requestWalletOwnershipVerdict(wallet, options(mainnet))).rejects.toMatchObject({
      name: 'WalletSignError',
      reason: 'invalid-challenge',
    });
    expect(wallet.provider.requests.some((r) => r.method === 'signMessage')).toBe(false);
  });
});

describe('createWalletOwnershipChallenger: the wallet-proof-v1 format', () => {
  const PROOF_DOMAIN = 'fairmint:tokenization-wallet-proof:v1';
  const CHALLENGE_URL = '/api/wallet-ownership/challenge';
  const VERIFY_URL = '/api/wallet-ownership/verify';

  function proofSetup(): {
    challenger: WalletOwnershipChallenger;
    clock: { now: Date };
  } {
    const clock = { now: NOW };
    return {
      clock,
      challenger: createWalletOwnershipChallenger({ secret: SECRET, purpose: PURPOSE, now: () => clock.now }),
    };
  }

  const issueProof = (challenger: WalletOwnershipChallenger, proofDomain?: string): WalletProofChallengeResponse =>
    challenger.issue({
      subject: SUB,
      domain: DOMAIN,
      network: 'devnet',
      partyId: party.partyId,
      format: 'wallet-proof-v1',
      ...(proofDomain !== undefined && { proofDomain }),
    });

  const signed = (
    message: string,
    key: PartyKey = party
  ): { partyId: string; publicKey: string; message: string; signature: string } => ({
    partyId: key.partyId,
    publicKey: key.publicKeyHex,
    message,
    signature: signHex(key.privateKey, message),
  });

  it('issues the exact message to sign: idempotencyKey is the nonce, investorContext the subject', () => {
    const { challenger } = proofSetup();
    const issued = issueProof(challenger, PROOF_DOMAIN);
    expect(issued.format).toBe('wallet-proof-v1');
    expect(issued.fields).toEqual({
      domain: PROOF_DOMAIN,
      network: 'devnet',
      partyId: party.partyId,
      investorContext: SUB,
      idempotencyKey: expect.stringMatching(/^[A-Za-z0-9_-]{32}$/),
      issuedAt: NOW.toISOString(),
      expiresAt: new Date(NOW.getTime() + DEFAULT_WALLET_OWNERSHIP_CHALLENGE_TTL_MS).toISOString(),
    });
    expect(issued.message).toBe(buildWalletProofMessage(issued.fields));
    expect(issued.message).toBe(JSON.stringify(issued.fields));
    expect(Object.keys(issued).sort()).toEqual(['fields', 'format', 'message', 'token']);
    // The proof domain defaults to the challenger's purpose.
    expect(issueProof(challenger).fields.domain).toBe(PURPOSE);
    // The text format stays the default.
    expect(challenger.issue({ subject: SUB, domain: DOMAIN, network: 'devnet', partyId: party.partyId })).toEqual({
      challenge: expect.objectContaining({ domain: DOMAIN }),
      token: expect.any(String),
    });
  });

  it('refuses a proof domain the message rules refuse, and an unknown format', () => {
    const { challenger } = proofSetup();
    expect(() => issueProof(challenger, 'has space')).toThrow(TypeError);
    expect(() =>
      challenger.issue({
        subject: SUB,
        domain: DOMAIN,
        network: 'devnet',
        partyId: party.partyId,
        format: 'other' as 'text',
      })
    ).toThrow('format must be text or wallet-proof-v1');
  });

  it('verifies the signed message once, with the text verdict shape', async () => {
    const { challenger, clock } = proofSetup();
    const { message, token } = issueProof(challenger, PROOF_DOMAIN);
    clock.now = LATER;
    const verify = async (proof: unknown): Promise<WalletOwnershipVerdict> =>
      challenger.verify({ token, proof, subject: SUB, domain: DOMAIN });
    await expect(verify(signed(message))).resolves.toEqual({
      verified: true,
      partyId: party.partyId,
      publicKeyFingerprint: party.namespace,
      claimedNetwork: 'devnet',
      verifiedAt: LATER.toISOString(),
    });
    expect(reasonOf(await verify(signed(message)))).toBe('challenge-used');
  });

  it('refuses a signed message whose fields differ from the issued ones', async () => {
    const { challenger, clock } = proofSetup();
    clock.now = LATER;
    for (const [change, reason] of [
      [{ investorContext: 'someone-else' }, 'investor-context-mismatch'],
      [{ idempotencyKey: 'another-nonce-0123456789' }, 'idempotency-key-mismatch'],
      [{ domain: 'fairmint:other:v1' }, 'domain-mismatch'],
      [{ network: 'mainnet' }, 'network-mismatch'],
      [{ expiresAt: new Date(NOW.getTime() + 60_000).toISOString() }, 'window-mismatch'],
    ] as const) {
      clock.now = NOW;
      const { fields, token } = issueProof(challenger, PROOF_DOMAIN);
      clock.now = LATER;
      const message = buildWalletProofMessage({ ...fields, ...change });
      expect(reasonOf(await challenger.verify({ token, proof: signed(message), subject: SUB, domain: DOMAIN }))).toBe(
        reason
      );
    }
  });

  it('refuses a text proof for a wallet-proof challenge, and a wallet proof for a text challenge', async () => {
    const { challenger, clock } = proofSetup();
    const proofChallenge = issueProof(challenger, PROOF_DOMAIN);
    const textChallenge = challenger.issue({ subject: SUB, domain: DOMAIN, network: 'devnet', partyId: party.partyId });
    clock.now = LATER;
    const text = loopProof(textChallenge.challenge);
    expect(
      reasonOf(await challenger.verify({ token: proofChallenge.token, proof: text, subject: SUB, domain: DOMAIN }))
    ).toBe('malformed-message');
    expect(
      reasonOf(
        await challenger.verify({
          token: textChallenge.token,
          proof: signed(proofChallenge.message),
          subject: SUB,
          domain: DOMAIN,
        })
      )
    ).toBe('malformed-message');
  });

  it('keeps the challenge bound to the subject and host through the token', async () => {
    const { challenger, clock } = proofSetup();
    const { message, token } = issueProof(challenger, PROOF_DOMAIN);
    clock.now = LATER;
    expect(reasonOf(await challenger.verify({ token, proof: signed(message), subject: 'other', domain: DOMAIN }))).toBe(
      'challenge-not-yours'
    );
    expect(
      reasonOf(await challenger.verify({ token, proof: signed(message), subject: SUB, domain: 'evil.example' }))
    ).toBe('challenge-not-yours');
  });

  it('refuses a token whose format claim was not issued with a proof domain', async () => {
    const { challenger, clock } = proofSetup();
    const { message, token } = issueProof(challenger, PROOF_DOMAIN);
    const [version, body] = token.split('.') as [string, string];
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Record<string, string>;
    expect(claims).toMatchObject({ format: 'wallet-proof-v1', proofDomain: PROOF_DOMAIN, network: 'devnet' });
    const { proofDomain: _dropped, ...withoutDomain } = claims;
    const forgedBody = Buffer.from(JSON.stringify(withoutDomain)).toString('base64url');
    const key = createHmac('sha256', SECRET).update(PURPOSE).digest();
    const forged = `${version}.${forgedBody}.${createHmac('sha256', key).update(`${version}.${forgedBody}`).digest('base64url')}`;
    clock.now = LATER;
    expect(
      reasonOf(await challenger.verify({ token: forged, proof: signed(message), subject: SUB, domain: DOMAIN }))
    ).toBe('challenge-invalid');
  });

  describe('through the handlers and requestWalletOwnershipVerdict', () => {
    function routes(): { fetch: FetchLike } {
      const challenger = createWalletOwnershipChallenger({ secret: SECRET, purpose: PURPOSE });
      const fetch: FetchLike = async (url, init) => {
        const request = new Request(`${ORIGIN}${url}`, {
          method: init.method,
          headers: { ...init.headers, origin: ORIGIN },
          ...(init.body !== undefined && { body: init.body }),
        });
        return url === CHALLENGE_URL
          ? challenger.handleChallenge(request, { subject: SUB, format: 'wallet-proof-v1', proofDomain: PROOF_DOMAIN })
          : challenger.handleVerify(request, { subject: SUB });
      };
      return { fetch };
    }

    function loopWallet(key: PartyKey = party): { provider: RecordingProvider; partyId: string; network: 'devnet' } {
      const provider = accountProvider({
        party: key.partyId,
        account: { publicKey: key.publicKeyHex, namespace: key.namespace },
        signMessage: (message) => ({ signature: signHex(key.privateKey, message) }),
      });
      return { provider, partyId: key.partyId, network: 'devnet' };
    }

    it('answers the challenge with the message, and verifies the proof the wallet signed exactly', async () => {
      const { fetch } = routes();
      const response = await fetch(CHALLENGE_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ network: 'devnet', partyId: party.partyId }),
      });
      const { data } = JSON.parse(await response.text()) as { data: WalletProofChallengeResponse };
      expect(data).toMatchObject({ format: 'wallet-proof-v1', fields: { domain: PROOF_DOMAIN, investorContext: SUB } });

      const wallet = loopWallet();
      const proofs: unknown[] = [];
      const verdict = await requestWalletOwnershipVerdict(wallet, {
        fetch,
        challengeUrl: CHALLENGE_URL,
        verifyUrl: VERIFY_URL,
        onProof: (proof) => proofs.push(proof),
      });
      expect(verdict).toMatchObject({ verified: true, partyId: party.partyId, claimedNetwork: 'devnet' });
      const messages = wallet.provider.requests.flatMap((r) => (r.method === 'signMessage' ? [r.params.message] : []));
      expect(messages).toHaveLength(1);
      expect(JSON.parse(messages[0] ?? '')).toMatchObject({ domain: PROOF_DOMAIN, partyId: party.partyId });
      expect(proofs).toEqual([
        {
          partyId: party.partyId,
          publicKey: party.publicKeyHex,
          namespace: party.namespace,
          message: messages[0],
          signature: expect.stringMatching(/^[0-9a-f]{128}$/),
        },
      ]);
    });
  });
});
