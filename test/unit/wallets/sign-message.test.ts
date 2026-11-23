/** What text wallets sign, and reading a `signMessage` answer (ported from the apiv2 Canton Wallet playground's tests). */
import * as Wallets from '../../../src/wallets';
import { readSignature, readSpecSignature, validateSignMessage } from '../../../src/wallets/sign-message';

describe('validateSignMessage', () => {
  it('needs 64 to 8192 bytes', () => {
    expect(validateSignMessage('short')).toEqual({ code: 'too-short', bytes: 5 });
    expect(validateSignMessage('x'.repeat(64))).toBeNull();
    expect(validateSignMessage('x'.repeat(8192))).toBeNull();
    expect(validateSignMessage('x'.repeat(8193))).toEqual({ code: 'too-long', bytes: 8193 });
  });

  it('counts UTF-8 bytes, not characters', () => {
    expect(validateSignMessage('é'.repeat(32))).toBeNull();
    expect(validateSignMessage('é'.repeat(31))).toEqual({ code: 'too-short', bytes: 62 });
  });

  it('refuses control characters but allows newlines and tabs', () => {
    expect(validateSignMessage(`${'x'.repeat(64)}\u0007`)).toEqual({ code: 'control-characters', bytes: 65 });
    expect(validateSignMessage(`${'x'.repeat(64)}\r`)?.code).toBe('control-characters');
    expect(validateSignMessage(`${'x'.repeat(64)}\u0085`)?.code).toBe('control-characters');
    expect(validateSignMessage(`${'x'.repeat(32)}\n\t${'x'.repeat(32)}`)).toBeNull();
  });

  it('refuses text that is not well formed', () => {
    expect(validateSignMessage(`${'x'.repeat(64)}\ud800`)?.code).toBe('malformed');
    expect(validateSignMessage(`${'x'.repeat(64)}😀`)).toBeNull();
  });

  it('takes other bounds', () => {
    expect(validateSignMessage('short', { minBytes: 1 })).toBeNull();
    expect(validateSignMessage('x'.repeat(65), { maxBytes: 64 })).toEqual({ code: 'too-long', bytes: 65 });
  });
});

describe('readSignature', () => {
  // Ported from apiv2's canton-wallet-model.test.ts "reads both answer shapes" (null there is undefined here).
  it('reads both answer shapes: { signature } and a bare string', () => {
    expect(readSignature({ signature: 'abc' })).toBe('abc');
    expect(readSignature('abc')).toBe('abc');
    expect(readSignature({ other: 1 })).toBeUndefined();
    expect(readSignature(null)).toBeUndefined();
  });

  it('gives undefined for an empty signature in either shape, and for other answers', () => {
    expect(readSignature({ signature: '' })).toBeUndefined();
    expect(readSignature('')).toBeUndefined();
    expect(readSignature({ signature: 42 })).toBeUndefined();
    expect(readSignature(42)).toBeUndefined();
    expect(readSignature(undefined)).toBeUndefined();
  });

  it('is exported from the wallets entry point', () => {
    expect(Wallets.readSignature).toBe(readSignature);
    expect(Wallets.validateSignMessage).toBe(validateSignMessage);
  });
});

describe('readSpecSignature', () => {
  it("reads the spec's { signature } shape only (the ownership proof's reader)", () => {
    expect(readSpecSignature({ signature: 'abc' })).toBe('abc');
    expect(readSpecSignature('abc')).toBeUndefined();
    expect(readSpecSignature({ other: 1 })).toBeUndefined();
    expect(readSpecSignature({ signature: '' })).toBeUndefined();
    expect(readSpecSignature(null)).toBeUndefined();
  });

  it('is not exported from the wallets entry point', () => {
    expect('readSpecSignature' in Wallets).toBe(false);
  });
});
