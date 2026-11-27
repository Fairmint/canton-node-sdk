import { fingerprintEd25519PublicKey } from '@fairmint/canton-protocol/party';
import { generateKeyPairSync, sign as ed25519Sign } from 'node:crypto';
import { isCancelledBeforeSubmit } from '../../../src/wallets/abort';
import { WalletReadError, WalletSignError } from '../../../src/wallets/errors';
import {
  buildWalletOwnershipMessage,
  parseWalletOwnershipMessage,
  proveWalletOwnership,
  proveWalletProof,
  requestWalletOwnershipVerdict,
  type WalletOwnershipChallenge,
} from '../../../src/wallets/ownership';
import { verifyWalletProof } from '../../../src/utils/external-signing';
import { accountProvider, fakeFetch, HOLDER, RpcError, type RecordingProvider } from './helpers';

const CHALLENGE: WalletOwnershipChallenge = {
  domain: 'explorer.example.com',
  nonce: 'n0nce-0123456789abcdef',
  issuedAt: '2026-11-16T12:00:00.000Z',
  expiresAt: '2026-11-16T12:05:00.000Z',
  network: 'canton:devnet',
};
const NOW = (): Date => new Date('2026-11-16T12:01:00.000Z');

const MESSAGE = [
  'Canton wallet ownership proof',
  'Sign this message only to prove to explorer.example.com that you control the Canton party below. It is not a transaction: it moves no assets and authorizes nothing on the ledger.',
  '',
  'Version: 1',
  'Domain: explorer.example.com',
  `Party: ${HOLDER}`,
  'Network: canton:devnet',
  'Nonce: n0nce-0123456789abcdef',
  'Issued At: 2026-11-16T12:00:00.000Z',
  'Expiration Time: 2026-11-16T12:05:00.000Z',
].join('\n');

describe('wallet ownership message', () => {
  it('is canonical text, and parses back to the same fields', () => {
    const message = buildWalletOwnershipMessage({ ...CHALLENGE, partyId: HOLDER });
    expect(message).toBe(MESSAGE);
    expect(parseWalletOwnershipMessage(message)).toEqual({ ...CHALLENGE, partyId: HOLDER });
  });

  it('leaves the network line out when the challenge has none', () => {
    const { network: _network, ...rest } = CHALLENGE;
    const message = buildWalletOwnershipMessage({ ...rest, partyId: HOLDER });
    expect(message).not.toContain('Network:');
    expect(parseWalletOwnershipMessage(message)).toEqual({ ...rest, partyId: HOLDER });
  });

  it.each([
    ['another title', MESSAGE.replace('Canton wallet', 'Canton Wallet')],
    ['another statement', MESSAGE.replace('authorizes nothing', 'authorizes everything')],
    ['another version', MESSAGE.replace('Version: 1', 'Version: 2')],
    ['a trailing newline', `${MESSAGE}\n`],
    ['a CRLF line end', MESSAGE.replace('\nNonce', '\r\nNonce')],
    ['an extra field', `${MESSAGE}\nResources: x`],
    ['a repeated field', `${MESSAGE}\nNonce: n0nce-0123456789abcdef`],
    ['reordered fields', MESSAGE.replace(/(Nonce: .*)\n(Issued At: .*)/, '$2\n$1')],
    ['a statement for another domain', MESSAGE.replace('prove to explorer', 'prove to evil')],
    ['an inherited field name', MESSAGE.replace('Nonce:', 'constructor:')],
    ['a non-canonical time', MESSAGE.replace('12:00:00.000Z', '12:00:00Z')],
    ['an expiry before issue', MESSAGE.replace('12:05:00.000Z', '11:00:00.000Z')],
    ['a short nonce', MESSAGE.replace('n0nce-0123456789abcdef', 'short')],
    ['a hex hash', '1220'.padEnd(68, 'ab')],
  ])('refuses %s', (_label, text) => {
    expect(parseWalletOwnershipMessage(text)).toBeNull();
  });

  it.each([
    ['a domain with a path', { domain: 'example.com/x' }],
    ['a domain with a newline', { domain: 'example.com\nParty: x::1220' }],
    ['a party without a namespace', { partyId: 'holder' }],
    ['a party with spaces', { partyId: 'hol der::1220aa' }],
    ['a nonce with a newline', { nonce: 'abcdefghijklmnop\nx' }],
    ['an invalid time', { issuedAt: 'yesterday' }],
    ['a network with a space', { network: 'canton devnet' }],
  ])('refuses to build a message with %s', (_label, change) => {
    expect(() => buildWalletOwnershipMessage({ ...CHALLENGE, partyId: HOLDER, ...change })).toThrow(TypeError);
  });
});

/** The provider as a devnet connection of HOLDER. */
const connected = (
  provider: RecordingProvider
): { provider: RecordingProvider; partyId: string; network: 'devnet' } => ({
  provider,
  partyId: HOLDER,
  network: 'devnet',
});

describe('proveWalletOwnership', () => {
  it('signs the canonical message as the primary account, and returns what the server verifies', async () => {
    const signed: string[] = [];
    const provider = accountProvider({
      account: { publicKey: 'ab'.repeat(32), namespace: '1220aa' },
      signMessage: (message) => {
        signed.push(message);
        return { signature: 'cd'.repeat(64) };
      },
    });
    const proof = await proveWalletOwnership(connected(provider), { challenge: CHALLENGE, now: NOW });
    expect(signed).toEqual([MESSAGE]);
    expect(proof).toEqual({
      partyId: HOLDER,
      publicKey: 'ab'.repeat(32),
      namespace: '1220aa',
      message: MESSAGE,
      signature: 'cd'.repeat(64),
    });
    expect(provider.requests).toEqual([
      { method: 'getPrimaryAccount' },
      { method: 'signMessage', params: { message: MESSAGE } },
    ]);
  });

  it('hands its signal to the wallet for the account read and the signature, so a cancelled proof frees them', async () => {
    const base = accountProvider({ signMessage: () => ({ signature: 'cd'.repeat(64) }) });
    const seen: Array<[string, AbortSignal | undefined]> = [];
    const provider: RecordingProvider = {
      ...base,
      request: async (args, options) => {
        seen.push([args.method, options?.signal]);
        return base.request(args, options);
      },
    };
    const { signal } = new AbortController();
    await proveWalletOwnership(connected(provider), { challenge: CHALLENGE, now: NOW, signal });
    expect(seen).toEqual([
      ['getPrimaryAccount', signal],
      ['signMessage', signal],
    ]);
  });

  it.each([
    ['another primary account', { party: 'other::1220dd' }, {}],
    ['an expired challenge', {}, { now: () => new Date('2026-11-16T12:05:00.000Z') }],
    ['a malformed challenge', {}, { challenge: { ...CHALLENGE, nonce: 'x' } }],
    ['a wallet on the other DA network', { account: { networkId: 'canton:mainnet' } }, {}],
    ['a challenge for the other DA network', {}, { challenge: { ...CHALLENGE, network: 'canton:mainnet' } }],
  ] as const)('refuses %s before asking the wallet to sign', async (_label, wallet, change) => {
    const provider = accountProvider({ ...wallet, signMessage: () => ({ signature: 'sig' }) });
    const error = await proveWalletOwnership(connected(provider), { challenge: CHALLENGE, now: NOW, ...change }).catch(
      (e: unknown) => e
    );
    expect(error).toBeInstanceOf(WalletSignError);
    expect(error).toMatchObject({ reason: 'invalid-challenge' });
    expect(provider.requests.map((r) => r.method)).toEqual(['getPrimaryAccount']);
  });

  it('names the network a wallet on the other DA network reports', async () => {
    const provider = accountProvider({ account: { networkId: 'canton:mainnet' } });
    await expect(proveWalletOwnership(connected(provider), { challenge: CHALLENGE, now: NOW })).rejects.toThrow(
      'The wallet is on canton:mainnet, not canton:devnet; switch networks in the wallet first'
    );
  });

  // The session's rule: CIP-0103 does not fix how a wallet spells its network id.
  it.each([['canton:dev'], ['canton:main'], [undefined]])('signs for a wallet reporting %p', async (networkId) => {
    const provider = accountProvider({ account: { networkId }, signMessage: () => ({ signature: 'sig' }) });
    await expect(proveWalletOwnership(connected(provider), { challenge: CHALLENGE, now: NOW })).resolves.toMatchObject({
      signature: 'sig',
    });
  });

  it('refuses an account without a public key', async () => {
    const provider = accountProvider({ account: { publicKey: '' }, signMessage: () => ({ signature: 'sig' }) });
    await expect(proveWalletOwnership(connected(provider), { challenge: CHALLENGE, now: NOW })).rejects.toBeInstanceOf(
      WalletReadError
    );
  });

  it.each([
    [new RpcError(4001, 'User rejected'), 'rejected-by-user', 4001],
    [new RpcError(4200, 'signMessage is not supported'), 'failed', 4200],
    [new Error('socket closed'), 'failed', undefined],
  ] as const)('maps a signMessage failure %p to %s', async (failure, reason, code) => {
    const provider = accountProvider({
      signMessage: () => {
        throw failure;
      },
    });
    const error = await proveWalletOwnership(connected(provider), { challenge: CHALLENGE, now: NOW }).catch(
      (e: unknown) => e
    );
    expect(error).toBeInstanceOf(WalletSignError);
    expect(error).toMatchObject({ reason, ...(code !== undefined && { code }) });
  });

  it.each([[{}], [{ signature: '' }], ['sig'], [42], [null]])(
    'refuses an answer that is not { signature }: %p',
    async (answer) => {
      const provider = accountProvider({ signMessage: () => answer });
      await expect(proveWalletOwnership(connected(provider), { challenge: CHALLENGE, now: NOW })).rejects.toMatchObject(
        { name: 'WalletSignError', reason: 'failed' }
      );
    }
  );
});

describe('requestWalletOwnershipVerdict', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('sends its requests with the global fetch when none is given', async () => {
    const fetch = jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => new Response('{"error":"nope"}', { status: 401 }));
    const provider = accountProvider();
    await expect(
      requestWalletOwnershipVerdict(connected(provider), { challengeUrl: '/challenge', verifyUrl: '/verify' })
    ).rejects.toThrow('The server refused the ownership check: nope');
    expect(fetch).toHaveBeenCalledWith('/challenge', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ network: 'devnet', partyId: HOLDER }),
    });
    expect(provider.requests).toEqual([]);
  });
});

describe('ownership checks: cancellation', () => {
  const isAbort = (error: unknown): boolean => (error as { name?: unknown }).name === 'AbortError';
  /** A challenge valid for the next five minutes (`requestWalletOwnershipVerdict` uses the system clock). */
  const liveChallenge = (): WalletOwnershipChallenge => {
    const issued = new Date(Math.floor(Date.now() / 1000) * 1000);
    return {
      ...CHALLENGE,
      issuedAt: issued.toISOString(),
      expiresAt: new Date(issued.getTime() + 5 * 60_000).toISOString(),
    };
  };
  const server = (): ReturnType<typeof fakeFetch> =>
    fakeFetch((call) =>
      call.url === '/challenge'
        ? { json: { data: { challenge: liveChallenge(), token: 'tok' } } }
        : {
            json: {
              data: {
                verified: true,
                partyId: HOLDER,
                publicKeyFingerprint: '1220aa',
                claimedNetwork: 'canton:devnet',
                verifiedAt: new Date().toISOString(),
              },
            },
          }
    );

  it('passes the signal to both requests of a check', async () => {
    const { fetch, calls } = server();
    const { signal } = new AbortController();
    const provider = accountProvider({ signMessage: () => ({ signature: 'cd'.repeat(64) }) });
    await expect(
      requestWalletOwnershipVerdict(connected(provider), {
        challengeUrl: '/challenge',
        verifyUrl: '/verify',
        fetch,
        signal,
      })
    ).resolves.toMatchObject({ verified: true });
    expect(calls.map((call) => [call.url, call.signal === signal])).toEqual([
      ['/challenge', true],
      ['/verify', true],
    ]);
  });

  it('sends nothing and asks the wallet for nothing once the signal aborted', async () => {
    const { fetch, calls } = server();
    const controller = new AbortController();
    controller.abort();
    const provider = accountProvider({ signMessage: () => ({ signature: 'sig' }) });
    const error = await requestWalletOwnershipVerdict(connected(provider), {
      challengeUrl: '/challenge',
      verifyUrl: '/verify',
      fetch,
      signal: controller.signal,
    }).catch((e: unknown) => e);
    expect(isAbort(error)).toBe(true);
    expect(calls).toEqual([]);
    expect(provider.requests).toEqual([]);
  });

  it('never sends a proof the wallet signed after the abort', async () => {
    const { fetch, calls } = server();
    const controller = new AbortController();
    let signing: () => void = () => undefined;
    const entered = new Promise<void>((resolve) => {
      signing = resolve;
    });
    let sign: (answer: unknown) => void = () => undefined;
    const provider = accountProvider({
      signMessage: async () => {
        signing();
        return new Promise((resolve) => {
          sign = resolve;
        });
      },
    });
    const check = requestWalletOwnershipVerdict(connected(provider), {
      challengeUrl: '/challenge',
      verifyUrl: '/verify',
      fetch,
      signal: controller.signal,
    }).catch((e: unknown) => e);
    await entered;
    controller.abort();
    sign({ signature: 'cd'.repeat(64) });
    expect(isAbort(await check)).toBe(true);
    expect(calls.map((call) => call.url)).toEqual(['/challenge']);
  });

  it('does not call a cancellation during the verify request "cancelled before submit": the proof was sent', async () => {
    const controller = new AbortController();
    const calls: string[] = [];
    const base = server().fetch;
    const fetch: typeof base = async (url, init) => {
      calls.push(url);
      if (url === '/verify') return new Promise<never>(() => undefined);
      return base(url, init);
    };
    const provider = accountProvider({ signMessage: () => ({ signature: 'cd'.repeat(64) }) });
    const check = requestWalletOwnershipVerdict(connected(provider), {
      challengeUrl: '/challenge',
      verifyUrl: '/verify',
      fetch,
      signal: controller.signal,
    }).catch((e: unknown) => e);
    while (!calls.includes('/verify')) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 5);
      });
    }
    controller.abort();
    const error = await check;
    expect(isAbort(error)).toBe(true);
    expect(isCancelledBeforeSubmit(error)).toBe(false);
  });

  it('does not ask the wallet to sign once proveWalletOwnership was cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    const provider = accountProvider({ signMessage: () => ({ signature: 'sig' }) });
    const error = await proveWalletOwnership(connected(provider), {
      challenge: CHALLENGE,
      now: NOW,
      signal: controller.signal,
    }).catch((e: unknown) => e);
    expect(isAbort(error)).toBe(true);
    expect(provider.requests).toEqual([]);
  });
});

describe('proveWalletProof', () => {
  const FIELDS = {
    domain: 'fairmint:tokenization-wallet-proof:v1',
    network: 'devnet',
    partyId: HOLDER,
    investorContext: 'investor-42',
    idempotencyKey: 'idem-7',
    issuedAt: '2026-11-16T12:00:00.000Z',
    expiresAt: '2026-11-16T12:05:00.000Z',
  } as const;
  const PROOF_MESSAGE = JSON.stringify(FIELDS);

  it('refuses a multibyte message over the signing limit in bytes before the wallet is asked', async () => {
    const provider = accountProvider({
      account: { publicKey: 'ab'.repeat(32), namespace: '1220aa' },
      signMessage: () => ({ signature: 'cd'.repeat(64) }),
    });
    const message = JSON.stringify({ ...FIELDS, investorContext: '\u20ac'.repeat(3000) });
    await expect(proveWalletProof(connected(provider), { message, now: NOW })).rejects.toMatchObject({
      reason: 'invalid-challenge',
    });
    expect(provider.requests).toEqual([]);
  });

  it('signs exactly the server-built message as the primary account, and returns the proof to show', async () => {
    const provider = accountProvider({
      account: { publicKey: 'ab'.repeat(32), namespace: '1220aa' },
      signMessage: () => ({ signature: 'cd'.repeat(64) }),
    });
    const proof = await proveWalletProof(connected(provider), { message: PROOF_MESSAGE, fields: FIELDS, now: NOW });
    expect(proof).toEqual({
      partyId: HOLDER,
      publicKey: Buffer.from('ab'.repeat(32), 'hex').toString('base64'),
      namespace: '1220aa',
      message: PROOF_MESSAGE,
      signature: Buffer.from('cd'.repeat(64), 'hex').toString('base64'),
    });
    expect(provider.requests).toEqual([
      { method: 'getPrimaryAccount' },
      { method: 'signMessage', params: { message: PROOF_MESSAGE } },
    ]);
  });

  it('passes base64 through and keeps a DER key as its base64', async () => {
    const raw = Buffer.alloc(32, 7).toString('base64');
    const der = Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.alloc(32, 7)]).toString('base64');
    const signature = Buffer.alloc(64, 9).toString('base64');
    for (const publicKey of [raw, der]) {
      const provider = accountProvider({ account: { publicKey }, signMessage: () => ({ signature }) });
      await expect(proveWalletProof(connected(provider), { message: PROOF_MESSAGE, now: NOW })).resolves.toMatchObject({
        publicKey,
        signature,
      });
    }
  });

  it('gives a hex wallet proof that verifyWalletProof accepts as base64', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const rawKey = publicKey.export({ format: 'der', type: 'spki' }).subarray(-32);
    const namespace = fingerprintEd25519PublicKey(rawKey.toString('base64'));
    const partyId = `alice::${namespace}`;
    const fields = { ...FIELDS, partyId };
    const message = JSON.stringify(fields);
    const provider = accountProvider({
      party: partyId,
      account: { publicKey: rawKey.toString('hex'), namespace },
      signMessage: () => ({ signature: ed25519Sign(null, Buffer.from(message, 'utf8'), privateKey).toString('hex') }),
    });
    const proof = await proveWalletProof({ ...connected(provider), partyId }, { message, fields, now: NOW });
    expect(proof.publicKey).toBe(rawKey.toString('base64'));
    expect(proof.signature).toMatch(/^[A-Za-z0-9+/]{86}==$/);
    const verdict = verifyWalletProof({
      proof,
      expected: { domain: fields.domain, network: 'devnet', partyId },
      now: NOW(),
    });
    expect(verdict).toMatchObject({ verified: true, publicKeyFingerprint: namespace });
  });

  it('signs without fields too', async () => {
    const provider = accountProvider({ signMessage: () => ({ signature: 'sig' }) });
    await expect(proveWalletProof(connected(provider), { message: PROOF_MESSAGE, now: NOW })).resolves.toMatchObject({
      message: PROOF_MESSAGE,
      signature: 'sig',
    });
  });

  it.each([
    ['text that is not a wallet proof', { message: MESSAGE }, 'not a wallet proof message'],
    ['a pretty-printed message', { message: JSON.stringify(FIELDS, null, 2) }, 'not a wallet proof message'],
    ['another party', { message: JSON.stringify({ ...FIELDS, partyId: 'other::1220dd' }) }, 'names other::1220dd'],
    ['the other network', { message: JSON.stringify({ ...FIELDS, network: 'mainnet' }) }, 'is for mainnet, not devnet'],
    ['fields that are not the message', { fields: { ...FIELDS, investorContext: 'x' } }, 'not the message'],
  ] as const)('refuses %s without asking the wallet anything', async (_label, change, text) => {
    const provider = accountProvider({ signMessage: () => ({ signature: 'sig' }) });
    const error = await proveWalletProof(connected(provider), { message: PROOF_MESSAGE, now: NOW, ...change }).catch(
      (e: unknown) => e
    );
    expect(error).toBeInstanceOf(WalletSignError);
    expect(error).toMatchObject({ reason: 'invalid-challenge', message: expect.stringContaining(text) });
    expect(provider.requests).toEqual([]);
  });

  it.each([
    ['another primary account', { party: 'other::1220dd' }, {}],
    ['a wallet on the other DA network', { account: { networkId: 'canton:mainnet' } }, {}],
    ['an expired message', {}, { now: () => new Date('2026-11-16T12:05:00.000Z') }],
  ] as const)('refuses %s before asking the wallet to sign', async (_label, wallet, change) => {
    const provider = accountProvider({ ...wallet, signMessage: () => ({ signature: 'sig' }) });
    const error = await proveWalletProof(connected(provider), { message: PROOF_MESSAGE, now: NOW, ...change }).catch(
      (e: unknown) => e
    );
    expect(error).toMatchObject({ name: 'WalletSignError', reason: 'invalid-challenge' });
    expect(provider.requests.map((r) => r.method)).toEqual(['getPrimaryAccount']);
  });

  it('maps a user rejection like the text proof', async () => {
    const provider = accountProvider({
      signMessage: () => {
        throw new RpcError(4001, 'User rejected');
      },
    });
    await expect(proveWalletProof(connected(provider), { message: PROOF_MESSAGE, now: NOW })).rejects.toMatchObject({
      reason: 'rejected-by-user',
      message: expect.stringContaining('wallet proof message'),
    });
  });

  describe('through requestWalletOwnershipVerdict', () => {
    const answering = (challenge: unknown): ReturnType<typeof fakeFetch> =>
      fakeFetch((call) => (call.url === '/c' ? { json: { data: challenge } } : { json: { data: {} } }));

    it.each([
      ['without a message', { format: 'wallet-proof-v1', fields: FIELDS, token: 't' }],
      ['without fields', { format: 'wallet-proof-v1', message: PROOF_MESSAGE, token: 't' }],
      ['without a token', { format: 'wallet-proof-v1', message: PROOF_MESSAGE, fields: FIELDS }],
    ])('refuses a wallet-proof challenge %s and signs nothing', async (_label, challenge) => {
      const provider = accountProvider({ signMessage: () => ({ signature: 'sig' }) });
      const { fetch } = answering(challenge);
      await expect(
        requestWalletOwnershipVerdict(connected(provider), { fetch, challengeUrl: '/c', verifyUrl: '/v' })
      ).rejects.toThrow('without { message, fields, token }');
      expect(provider.requests).toEqual([]);
    });

    it('refuses a challenge in a format it does not know', async () => {
      const provider = accountProvider({ signMessage: () => ({ signature: 'sig' }) });
      const { fetch } = answering({ format: 'wallet-proof-v2', challenge: CHALLENGE, token: 't' });
      await expect(
        requestWalletOwnershipVerdict(connected(provider), { fetch, challengeUrl: '/c', verifyUrl: '/v' })
      ).rejects.toThrow('without { challenge, token }');
      expect(provider.requests).toEqual([]);
    });
  });
});
