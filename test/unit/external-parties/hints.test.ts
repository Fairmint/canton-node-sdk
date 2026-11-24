import {
  buildExternalPartyId,
  DEFAULT_EXTERNAL_PARTY_HINT,
  MAX_NEW_EXTERNAL_PARTY_HINT_LENGTH,
  suggestExternalPartyHint,
  validateExternalPartyHint,
} from '../../../src/external-parties';
import { createKey } from './support';

describe('suggestExternalPartyHint', () => {
  it("is short and readable, from the app's base name or wallet", () => {
    expect(DEFAULT_EXTERNAL_PARTY_HINT).toBe('wallet');
    expect(suggestExternalPartyHint()).toBe('wallet');
    expect(suggestExternalPartyHint({ base: "Nick O'Brien" })).toBe('nick-o-brien');
    expect(suggestExternalPartyHint({ base: 'nick.s+test' })).toBe('nick-s-test');
    expect(suggestExternalPartyHint({ base: 'José' })).toBe('jose');
    expect(suggestExternalPartyHint({ base: '  ***  ' })).toBe('wallet');
    expect(suggestExternalPartyHint({ base: '  ***  ', fallback: 'account' })).toBe('account');
    expect(suggestExternalPartyHint({ base: 'a-very-long-display-name-indeed' })).toBe('a-very-long-display-name');
  });

  it('appends -2, -3, ... to avoid the hints already taken', () => {
    expect(suggestExternalPartyHint({ taken: ['wallet'] })).toBe('wallet-2');
    expect(suggestExternalPartyHint({ base: 'nick', taken: ['nick', 'nick-2', 'wallet'] })).toBe('nick-3');
  });

  it('gives a hint buildExternalPartyId and validateExternalPartyHint accept', () => {
    const { fingerprint } = createKey();
    const hint = suggestExternalPartyHint({ base: 'Nick' });
    expect(buildExternalPartyId(hint, fingerprint)).toBe(`nick::${fingerprint}`);
    expect(validateExternalPartyHint(hint)).toBeNull();
  });
});

describe('validateExternalPartyHint', () => {
  it('accepts a short new hint and says why it refuses one', () => {
    expect(validateExternalPartyHint(' wallet_2-b ')).toBeNull();
    expect(validateExternalPartyHint('   ')).toBe('empty');
    expect(validateExternalPartyHint('a'.repeat(MAX_NEW_EXTERNAL_PARTY_HINT_LENGTH + 1))).toBe('too-long');
    expect(validateExternalPartyHint('a'.repeat(MAX_NEW_EXTERNAL_PARTY_HINT_LENGTH))).toBeNull();
    expect(validateExternalPartyHint('-wallet')).toBe('charset');
    expect(validateExternalPartyHint('a::b')).toBe('charset');
    expect(validateExternalPartyHint('wallet', ['wallet'])).toBe('taken');
    expect(validateExternalPartyHint(42 as unknown as string)).toBe('empty');
  });
});
