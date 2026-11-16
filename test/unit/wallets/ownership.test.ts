import {
  buildWalletOwnershipMessage,
  proveWalletOwnership,
  WalletReadError,
  WalletSignError,
  type WalletOwnershipChallenge,
} from '../../../src/wallets';
import { parseWalletOwnershipMessage } from '../../../src/wallets/ownership';
import { fakeProvider, HOLDER, RpcError } from './helpers';

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

describe('proveWalletOwnership', () => {
  it('signs the canonical message as the primary account, and returns what the server verifies', async () => {
    const signed: string[] = [];
    const provider = fakeProvider(
      {},
      {
        account: { publicKey: 'ab'.repeat(32), namespace: '1220aa' },
        signMessage: (message) => {
          signed.push(message);
          return { signature: 'cd'.repeat(64) };
        },
      }
    );
    const proof = await proveWalletOwnership(provider, { challenge: CHALLENGE, partyId: HOLDER, now: NOW });
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

  it('accepts a wallet that answers a bare signature string', async () => {
    const provider = fakeProvider({}, { signMessage: () => 'sig' });
    await expect(proveWalletOwnership(provider, { challenge: CHALLENGE, now: NOW })).resolves.toMatchObject({
      signature: 'sig',
    });
  });

  it.each([
    ['another primary account', { partyId: 'other::1220dd' }, 'invalid-challenge'],
    ['an expired challenge', { now: () => new Date('2026-11-16T12:05:00.000Z') }, 'invalid-challenge'],
    ['a malformed challenge', { challenge: { ...CHALLENGE, nonce: 'x' } }, 'invalid-challenge'],
    ['a wallet on another network', { challenge: { ...CHALLENGE, network: 'canton:mainnet' } }, 'invalid-challenge'],
  ] as const)('refuses %s before asking the wallet to sign', async (_label, change, reason) => {
    const provider = fakeProvider({}, { signMessage: () => ({ signature: 'sig' }) });
    const error = await proveWalletOwnership(provider, { challenge: CHALLENGE, now: NOW, ...change }).catch(
      (e: unknown) => e
    );
    expect(error).toBeInstanceOf(WalletSignError);
    expect(error).toMatchObject({ reason });
    expect(provider.requests.map((r) => r.method)).toEqual(['getPrimaryAccount']);
  });

  it('refuses an account without a public key', async () => {
    const provider = fakeProvider({}, { account: { publicKey: '' }, signMessage: () => ({ signature: 'sig' }) });
    await expect(proveWalletOwnership(provider, { challenge: CHALLENGE, now: NOW })).rejects.toBeInstanceOf(
      WalletReadError
    );
  });

  it.each([
    [new RpcError(4001, 'User rejected'), 'rejected-by-user', 4001],
    [new RpcError(4200, 'signMessage is not supported'), 'failed', 4200],
    [new Error('socket closed'), 'failed', undefined],
  ] as const)('maps a signMessage failure %p to %s', async (failure, reason, code) => {
    const provider = fakeProvider(
      {},
      {
        signMessage: () => {
          throw failure;
        },
      }
    );
    const error = await proveWalletOwnership(provider, { challenge: CHALLENGE, now: NOW }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(WalletSignError);
    expect(error).toMatchObject({ reason, ...(code !== undefined && { code }) });
  });

  it.each([[{}], [{ signature: '' }], [42], [null]])('refuses an answer without a signature: %p', async (answer) => {
    const provider = fakeProvider({}, { signMessage: () => answer });
    await expect(proveWalletOwnership(provider, { challenge: CHALLENGE, now: NOW })).rejects.toMatchObject({
      name: 'WalletSignError',
      reason: 'failed',
    });
  });
});
