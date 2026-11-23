/** Display helpers that return trimmed text or codes (ported from the apiv2 Canton Wallet playground's tests). */
import * as Wallets from '../../../src/wallets';
import {
  describePreapprovalScope,
  formatOfferExpiry,
  formatTokenAmount,
  OFFER_EXPIRY_SOON_MS,
  shortCantonId,
} from '../../../src/wallets/format';

describe('formatTokenAmount', () => {
  it('drops trailing zeros and a bare point', () => {
    expect(formatTokenAmount('4.0000000000')).toBe('4');
    expect(formatTokenAmount('1.2500000000')).toBe('1.25');
    expect(formatTokenAmount('0.0000000001')).toBe('0.0000000001');
    expect(formatTokenAmount('10')).toBe('10');
    expect(formatTokenAmount('100')).toBe('100');
  });
});

describe('formatOfferExpiry', () => {
  const now = Date.parse('2026-11-20T12:00:00Z');

  it('is soon within 48 hours, with the time left', () => {
    expect(formatOfferExpiry('2026-11-21T11:00:00Z', now)).toEqual({
      kind: 'soon',
      at: Date.parse('2026-11-21T11:00:00Z'),
      msLeft: 23 * 60 * 60 * 1000,
    });
    expect(formatOfferExpiry('2026-11-20T12:20:00Z', now)).toMatchObject({ kind: 'soon', msLeft: 20 * 60 * 1000 });
  });

  it('is expired from the deadline on', () => {
    expect(formatOfferExpiry('2026-11-20T11:00:00Z', now)).toMatchObject({ kind: 'expired', msLeft: -3_600_000 });
    expect(formatOfferExpiry('2026-11-20T12:00:00Z', now)).toMatchObject({ kind: 'expired', msLeft: 0 });
  });

  it('is later beyond the soon window, which can be changed', () => {
    expect(formatOfferExpiry('2026-11-25T08:37:40Z', now)).toMatchObject({
      kind: 'later',
      at: Date.parse('2026-11-25T08:37:40Z'),
    });
    expect(formatOfferExpiry(new Date(now + OFFER_EXPIRY_SOON_MS).toISOString(), now)?.kind).toBe('later');
    expect(formatOfferExpiry('2026-11-21T11:00:00Z', now, { soonMs: 60 * 60 * 1000 })?.kind).toBe('later');
  });

  it('reads nothing from a value it cannot parse', () => {
    expect(formatOfferExpiry('soon', now)).toBeNull();
  });
});

describe('describePreapprovalScope', () => {
  it('is issuer-wide for an empty list, else its instrument ids', () => {
    expect(describePreapprovalScope({ instrumentIds: [] })).toEqual({ kind: 'issuer' });
    expect(describePreapprovalScope({ instrumentIds: ['CNTN'] })).toEqual({
      kind: 'instruments',
      instrumentIds: ['CNTN'],
    });
  });
});

describe('shortCantonId', () => {
  it('keeps short values and party hints', () => {
    expect(shortCantonId('abc')).toBe('abc');
    expect(shortCantonId(`alice::1220${'a'.repeat(60)}`)).toBe(`alice::${'a'.repeat(8)}`);
    expect(shortCantonId('0123456789abcdefghijklmnopqrstuvwxyz')).toBe('01234567…stuvwxyz');
  });

  it('keeps ids up to 2 * keep + 3 characters, and a hint of at most 24 characters', () => {
    expect(shortCantonId('x'.repeat(19))).toBe('x'.repeat(19));
    expect(shortCantonId('x'.repeat(20))).toBe('xxxxxxxx…xxxxxxxx');
    const longHint = `${'h'.repeat(25)}::1220${'b'.repeat(60)}`;
    expect(shortCantonId(longHint)).toBe(`hhhhhhhh…${'b'.repeat(8)}`);
    expect(shortCantonId(`alice::1220${'a'.repeat(60)}`, 4)).toBe('alice::aaaa');
  });

  it('is exported from the wallets entry point', () => {
    expect(Wallets.shortCantonId).toBe(shortCantonId);
    expect(Wallets.formatTokenAmount).toBe(formatTokenAmount);
    expect(Wallets.formatOfferExpiry).toBe(formatOfferExpiry);
    expect(Wallets.describePreapprovalScope).toBe(describePreapprovalScope);
  });
});
