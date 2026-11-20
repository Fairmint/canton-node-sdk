/** `describeWalletError`: a user-facing sentence that says whether anything was submitted, and a kind to branch on. */
import { runInNewContext } from 'node:vm';

import { cancelledBeforeSubmit, isCancelledBeforeSubmit } from '../../../src/wallets/abort';
import {
  describeWalletError,
  isRegistryApiError,
  isRegistryResponseError,
  isWalletCancellation,
  isWalletError,
  isWalletReadError,
  isWalletSignError,
  isWalletSubmitError,
  RegistryApiError,
  RegistryResponseError,
  WalletError,
  WalletReadError,
  WalletSignError,
  WalletSubmitError,
} from '../../../src/wallets/errors';

describe('describeWalletError', () => {
  it('tells the user whether a submission was made', () => {
    expect(describeWalletError(new WalletSubmitError('rejected-by-user', 'declined', { code: 4001 }))).toEqual({
      kind: 'declined',
      message: 'You declined in the wallet. Nothing was submitted.',
      code: 4001,
      category: 'user-rejected',
    });
    expect(describeWalletError(new WalletSubmitError('failed', 'ledger said no'))).toEqual({
      kind: 'not-committed',
      message: 'Not committed: ledger said no',
      category: 'unknown',
    });
    // The SDK's unknown outcome already warns against resubmitting.
    const unknown = describeWalletError(new WalletSubmitError('unknown', 'timed out', { code: -32002 }));
    expect(unknown).toMatchObject({ kind: 'outcome-unknown', code: -32002 });
    expect(unknown.message).toMatch(/^timed out .*do not resubmit blindly/);
    expect(unknown).not.toHaveProperty('commandId');
  });

  it('names the command id and burn reference of an unknown outcome, once each', () => {
    const error = new WalletSubmitError('unknown', 'The wallet did not confirm the transaction: timed out.', {
      code: -32002,
      commandId: 'cmd-1',
    });
    expect(error.message).toBe(
      'The wallet did not confirm the transaction: timed out. The outcome is unknown: do not resubmit blindly; check the wallet for the result first. Command id: cmd-1.'
    );
    // Rewrapped with a burn reference (as requestBurn does): the hint and the command id are not repeated.
    const burn = new WalletSubmitError('unknown', `${error.message} Burn reference: holder-burn-1.`, {
      code: -32002,
      commandId: 'cmd-1',
      burnReference: 'holder-burn-1',
    });
    expect(describeWalletError(burn)).toEqual({
      kind: 'outcome-unknown',
      message: `${error.message} Burn reference: holder-burn-1.`,
      code: -32002,
      commandId: 'cmd-1',
      burnReference: 'holder-burn-1',
      category: 'unknown',
    });
    // Only an unknown outcome carries them in its description.
    expect(describeWalletError(new WalletSubmitError('failed', 'ledger said no', { commandId: 'cmd-1' }))).toEqual({
      kind: 'not-committed',
      message: 'Not committed: ledger said no',
      category: 'unknown',
    });
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
    expect(describeWalletError(new WalletError('insufficient-balance', 'Only 1 TOKEN'))).toEqual({
      kind: 'refused',
      message: 'Only 1 TOKEN',
      code: 'insufficient-balance',
    });
    const busy = describeWalletError(
      new WalletError('busy', 'Another wallet action is in progress; nothing was submitted')
    );
    expect(busy).toMatchObject({ kind: 'refused', code: 'busy' });
    expect(busy.message).toMatch(/nothing was submitted/);
  });

  it('describes something that already exists as refused', () => {
    expect(describeWalletError(new WalletError('already-exists', 'A preapproval already covers XMPL'))).toEqual({
      kind: 'refused',
      message: 'A preapproval already covers XMPL',
      code: 'already-exists',
    });
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

  it('carries the category and Canton error id of a failed submission', () => {
    const error = new WalletSubmitError('failed', 'locked', {
      code: -32003,
      category: 'contention',
      cantonErrorId: 'LOCAL_VERDICT_LOCKED_CONTRACTS',
    });
    expect(describeWalletError(error)).toEqual({
      kind: 'not-committed',
      message: 'Not committed: locked',
      code: -32003,
      category: 'contention',
      cantonErrorId: 'LOCAL_VERDICT_LOCKED_CONTRACTS',
    });
  });

  it('says nothing was submitted only for the cancellation the module throws before submitting', () => {
    const controller = new AbortController();
    controller.abort();
    const own = cancelledBeforeSubmit(controller.signal);
    expect(own.name).toBe('AbortError');
    expect(describeWalletError(own)).toEqual({ kind: 'cancelled', message: 'Cancelled. Nothing was submitted.' });
    expect(isCancelledBeforeSubmit(runInNewContext('(e) => e')(own))).toBe(true);
    expect(isWalletCancellation(own)).toBe(true);
  });

  it('describes a foreign AbortError or TimeoutError without claiming nothing was submitted', () => {
    const neutral = { kind: 'cancelled', message: 'Cancelled; this does not say whether anything was submitted.' };
    const abort = new Error('The operation was aborted');
    abort.name = 'AbortError';
    expect(describeWalletError(abort)).toEqual(neutral);
    const controller = new AbortController();
    controller.abort();
    expect(describeWalletError(controller.signal.reason)).toEqual(neutral);
    expect(describeWalletError(new DOMException('timed out', 'TimeoutError'))).toEqual(neutral);
    expect(isWalletCancellation(new Error('x'))).toBe(false);
    expect(isCancelledBeforeSubmit(abort)).toBe(false);
  });
});

describe('wallet error guards', () => {
  const errors = {
    WalletError: new WalletError('busy', 'busy'),
    WalletSubmitError: new WalletSubmitError('failed', 'no'),
    WalletReadError: new WalletReadError('no'),
    WalletSignError: new WalletSignError('failed', 'no'),
    RegistryApiError: new RegistryApiError(500, 'x', 'https://da.example'),
    RegistryResponseError: new RegistryResponseError('x'),
  };
  const guards = {
    WalletError: isWalletError,
    WalletSubmitError: isWalletSubmitError,
    WalletReadError: isWalletReadError,
    WalletSignError: isWalletSignError,
    RegistryApiError: isRegistryApiError,
    RegistryResponseError: isRegistryResponseError,
  };

  it('match each class and no other', () => {
    for (const [name, guard] of Object.entries(guards)) {
      for (const [other, error] of Object.entries(errors)) {
        expect([name, other, guard(error)]).toEqual([name, other, name === other]);
      }
    }
  });

  it('match an error of another copy of the module by its brand, where instanceof does not', () => {
    // Another copy of the module: a fresh load of the same file (as a page that bundles the SDK twice would have).
    let copy: typeof import('../../../src/wallets/errors') | undefined;
    jest.isolateModules(() => {
      copy = jest.requireActual<typeof import('../../../src/wallets/errors')>('../../../src/wallets/errors');
    });
    if (copy === undefined) throw new Error('no copy');
    expect(copy.WalletError).not.toBe(WalletError);
    const foreign = new copy.WalletError('not-found', 'gone');
    expect(foreign instanceof WalletError).toBe(false);
    expect(isWalletError(foreign)).toBe(true);
    expect(isWalletSubmitError(foreign)).toBe(false);
    expect(describeWalletError(foreign)).toEqual({ kind: 'refused', message: 'gone', code: 'not-found' });
    const submit = new copy.WalletSubmitError('unknown', 'timed out', { commandId: 'cmd-9', category: 'timeout' });
    expect(isWalletSubmitError(submit)).toBe(true);
    expect(describeWalletError(submit)).toMatchObject({
      kind: 'outcome-unknown',
      commandId: 'cmd-9',
      category: 'timeout',
    });
  });

  it('do not match look-alikes, and never throw', () => {
    const lookAlike = Object.assign(new Error('x'), { name: 'WalletError', code: 'busy' });
    expect(isWalletError(lookAlike)).toBe(false);
    expect(isWalletError({ name: 'WalletError' })).toBe(false);
    expect(isWalletError(null)).toBe(false);
    expect(isWalletError('WalletError')).toBe(false);
    const hostile = new Proxy(
      {},
      {
        get() {
          throw new Error('trap');
        },
      }
    );
    expect(isWalletError(hostile)).toBe(false);
    // The brand is a global symbol, so it holds across realms too.
    const otherRealm: unknown = runInNewContext(
      "const e = new Error('x'); Object.defineProperty(e, Symbol.for('@fairmint/canton-node-sdk/wallets.error'), { value: 'WalletSubmitError' }); e"
    );
    expect(isWalletSubmitError(otherRealm)).toBe(true);
  });

  it('keep the brand out of enumeration and JSON', () => {
    const error = new WalletError('busy', 'busy');
    expect(Object.keys(error)).not.toContain('brand');
    expect(
      Object.getOwnPropertySymbols(error).map((symbol) => Object.getOwnPropertyDescriptor(error, symbol)?.enumerable)
    ).toEqual([false]);
  });
});
