/** `describeWalletError`: a user-facing sentence that says whether anything was submitted, and a kind to branch on. */
import {
  describeWalletError,
  RegistryApiError,
  RegistryResponseError,
  TokenWalletError,
  WalletReadError,
  WalletSignError,
  WalletSubmitError,
} from '../../../src/wallets';

describe('describeWalletError', () => {
  it('tells the user whether a submission was made', () => {
    expect(describeWalletError(new WalletSubmitError('rejected-by-user', 'declined', { code: 4001 }))).toEqual({
      kind: 'declined',
      message: 'You declined in the wallet. Nothing was submitted.',
      code: 4001,
    });
    expect(describeWalletError(new WalletSubmitError('failed', 'ledger said no'))).toEqual({
      kind: 'not-committed',
      message: 'Not committed: ledger said no',
    });
    // The SDK's unknown outcome already warns against resubmitting.
    const unknown = describeWalletError(new WalletSubmitError('unknown', 'timed out', { code: -32002 }));
    expect(unknown).toMatchObject({ kind: 'outcome-unknown', code: -32002 });
    expect(unknown.message).toMatch(/^timed out .*do not resubmit blindly/);
  });

  it('asks for a retry when the wallet kept rate-limiting a read', () => {
    const limited = describeWalletError(new WalletReadError('Limit exceeded', -32005));
    expect(limited).toEqual({
      kind: 'rate-limited',
      message:
        'The wallet is limiting how often this page reads the ledger (CIP-0103 -32005), and it still refused after a few retries. Wait a moment, then retry. Details: Limit exceeded',
      code: -32005,
    });
    expect(describeWalletError(new WalletReadError('not connected', 4100))).toEqual({
      kind: 'read-failed',
      message: 'The wallet did not answer a read: not connected',
      code: 4100,
    });
    expect(describeWalletError(new WalletReadError('no partyId'))).toEqual({
      kind: 'read-failed',
      message: 'The wallet did not answer a read: no partyId',
    });
    // Only the SDK's own rate-limited read counts, not any error that says so.
    expect(describeWalletError(new Error('Limit exceeded')).kind).toBe('other');
  });

  it('says when the wallet did not sign the ownership message', () => {
    expect(describeWalletError(new WalletSignError('rejected-by-user', 'declined', 4001))).toEqual({
      kind: 'declined',
      message: 'You declined to sign in the wallet. Nothing was verified.',
      code: 4001,
    });
    expect(describeWalletError(new WalletSignError('failed', 'no signature'))).toEqual({
      kind: 'sign-failed',
      message: 'The wallet did not sign: no signature',
    });
    expect(describeWalletError(new WalletSignError('invalid-challenge', 'expired'))).toEqual({
      kind: 'sign-failed',
      message: 'The wallet did not sign: expired',
    });
  });

  it('shows the registry status and at most 300 characters of its body', () => {
    expect(describeWalletError(new RegistryApiError(404, 'not found', 'https://da.example'))).toEqual({
      kind: 'registry',
      message: "DA's registry answered 404: not found",
      code: 404,
    });
    const long = describeWalletError(new RegistryApiError(500, 'x'.repeat(1000), 'https://da.example'));
    expect(long.message).toBe(`DA's registry answered 500: ${'x'.repeat(300)}`);
    expect(describeWalletError(new RegistryResponseError('The registry named a factory it did not disclose.'))).toEqual(
      { kind: 'registry', message: 'The registry named a factory it did not disclose.' }
    );
  });

  it('keeps the message and code of an action the SDK refused', () => {
    expect(describeWalletError(new TokenWalletError('insufficient-balance', 'Only 1 TOKEN'))).toEqual({
      kind: 'refused',
      message: 'Only 1 TOKEN',
      code: 'insufficient-balance',
    });
    const busy = describeWalletError(
      new TokenWalletError('busy', 'Another wallet action is in progress; nothing was submitted')
    );
    expect(busy).toMatchObject({ kind: 'refused', code: 'busy' });
    expect(busy.message).toMatch(/nothing was submitted/);
  });

  it('describes anything else thrown without throwing itself', () => {
    expect(describeWalletError(new TypeError('boom'))).toEqual({ kind: 'other', message: 'boom' });
    expect(describeWalletError({ code: 1 })).toEqual({ kind: 'other', message: '{"code":1}' });
    expect(describeWalletError(undefined)).toEqual({ kind: 'other', message: 'undefined' });
    expect(describeWalletError(10n)).toEqual({ kind: 'other', message: '10' });
    const cyclic: Record<string, unknown> = {};
    cyclic['self'] = cyclic;
    expect(describeWalletError(cyclic)).toEqual({ kind: 'other', message: '[object Object]' });
  });
});
