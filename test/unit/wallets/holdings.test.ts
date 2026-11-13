import {
  formatDecimalUnits,
  parseDecimalUnits,
  TokenWalletError,
  type Holding,
  type InstrumentId,
} from '../../../src/wallets';
import {
  MAX_SKIPPING_COVER_CANDIDATES,
  parseHolding,
  requirePositiveAmount,
  selectHoldings,
} from '../../../src/wallets/holdings';
import { INSTRUMENT, contract, HOLDER, holdingView, OTHER, REGISTRAR } from './helpers';

describe('decimal units', () => {
  it.each([
    ['0', 0n],
    ['1', 10_000_000_000n],
    ['40.0000000000', 400_000_000_000n],
    ['0.0000000001', 1n],
    ['12.5', 125_000_000_000n],
    ['9999999999999999999999999999.9999999999', 99999999999999999999999999999999999999n],
  ])('parses %s exactly', (text, units) => {
    expect(parseDecimalUnits(text)).toBe(units);
  });

  it.each(['', '-1', '1.', '.5', '1e3', '0.00000000001', ' 1', '1,0', 'NaN'])('refuses %j', (text) => {
    expect(parseDecimalUnits(text)).toBeNull();
  });

  it('formats with exactly 10 places and never goes through a float', () => {
    expect(formatDecimalUnits(1n)).toBe('0.0000000001');
    expect(formatDecimalUnits(0n)).toBe('0.0000000000');
    // 0.1 + 0.2 in units: exact, unlike floats.
    expect(formatDecimalUnits((parseDecimalUnits('0.1') ?? 0n) + (parseDecimalUnits('0.2') ?? 0n))).toBe(
      '0.3000000000'
    );
    expect(() => formatDecimalUnits(-1n)).toThrow(RangeError);
  });

  it('requires a positive amount', () => {
    expect(requirePositiveAmount(' 2.5 ')).toBe(25_000_000_000n);
    for (const bad of ['0', '0.0', '-1', 'abc', '1.00000000001']) {
      expect(() => requirePositiveAmount(bad)).toThrow(TokenWalletError);
    }
  });
});

describe('parseHolding', () => {
  it('reads the HoldingV1 view', () => {
    expect(parseHolding(holdingView('00h', '5.0000000000'))).toEqual({
      contractId: '00h',
      owner: HOLDER,
      instrumentId: INSTRUMENT,
      amount: '5.0000000000',
      locked: false,
    });
  });

  it('treats a lock record as locked and Daml None as unlocked', () => {
    expect(parseHolding(holdingView('00h', '5', { lock: { holders: [REGISTRAR] } }))?.locked).toBe(true);
    expect(parseHolding(holdingView('00h', '5', { lock: { tag: 'None' } }))?.locked).toBe(false);
  });

  it('falls back to the DA Holding create argument (absent lock = unlocked)', () => {
    const args = {
      operator: 'op',
      provider: REGISTRAR,
      registrar: REGISTRAR,
      owner: HOLDER,
      instrument: {
        source: REGISTRAR,
        id: 'XMPL',
        scheme: 'RegistrarInternalScheme',
      },
      label: '',
      amount: '100000.0000000000',
    };
    const daHolding = contract('00da', 'Utility.Registry.Holding.V0.Holding:Holding', args);
    expect(parseHolding(daHolding)).toEqual({
      contractId: '00da',
      owner: HOLDER,
      instrumentId: INSTRUMENT,
      amount: '100000.0000000000',
      locked: false,
    });
    const locked = contract('00dl', 'Utility.Registry.Holding.V0.Holding:Holding', {
      ...args,
      lock: { lockers: { map: [[REGISTRAR, {}]] }, context: 'x' },
    });
    expect(parseHolding(locked)?.locked).toBe(true);
  });

  it('fails closed on unreadable holdings and other templates', () => {
    expect(parseHolding(holdingView('00h', '1.5e3'))).toBeNull();
    expect(parseHolding(holdingView('00h', '1', { lock: 'oops' as never }))).toBeNull();
    expect(parseHolding(holdingView('00h', '1', { instrument: { admin: REGISTRAR } }))).toBeNull();
    expect(parseHolding(contract('00x', 'Some.Other:Template', { owner: HOLDER, amount: '1' }))).toBeNull();
  });
});

describe('selectHoldings', () => {
  const h = (contractId: string, amount: string, extra: Partial<Holding> = {}): Holding => ({
    contractId,
    owner: HOLDER,
    instrumentId: INSTRUMENT,
    amount,
    locked: false,
    ...extra,
  });
  const request = (amount: string): { owner: string; instrumentId: InstrumentId; amount: string } => ({
    owner: HOLDER,
    instrumentId: INSTRUMENT,
    amount,
  });

  it('takes the largest holdings first, ties broken by contract id', () => {
    const holdings = [h('00b', '3'), h('00a', '3'), h('00c', '10'), h('00d', '1')];
    expect(selectHoldings(holdings, request('12'))).toEqual({
      inputHoldingCids: ['00c', '00a'],
      selectedTotal: '13.0000000000',
      amount: '12.0000000000',
    });
    // Same input in another order gives the same selection.
    expect(selectHoldings([...holdings].reverse(), request('12')).inputHoldingCids).toEqual(['00c', '00a']);
  });

  it('stops at an exact cover', () => {
    expect(selectHoldings([h('00a', '5'), h('00b', '5')], request('5')).inputHoldingCids).toEqual(['00a']);
  });

  it('skips locked, foreign, other-instrument and zero holdings', () => {
    const holdings = [
      h('00locked', '100', { locked: true }),
      h('00foreign', '100', { owner: OTHER }),
      h('00other', '100', { instrumentId: { admin: REGISTRAR, id: 'USD' } }),
      h('00admin', '100', { instrumentId: { admin: OTHER, id: 'XMPL' } }),
      h('00zero', '0'),
      h('00ok', '1.0000000001'),
    ];
    expect(selectHoldings(holdings, request('1.0000000001')).inputHoldingCids).toEqual(['00ok']);
  });

  it('adds sub-unit amounts exactly', () => {
    const holdings = [h('00a', '0.1'), h('00b', '0.2')];
    expect(selectHoldings(holdings, request('0.3')).selectedTotal).toBe('0.3000000000');
  });

  it('reports an insufficient unlocked balance', () => {
    const holdings = [h('00a', '2'), h('00b', '50', { locked: true })];
    expect(() => selectHoldings(holdings, request('3'))).toThrow(
      'Insufficient unlocked XMPL: need 3.0000000000, have 2.0000000000'
    );
    let caught: unknown;
    try {
      selectHoldings([], request('1'));
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(TokenWalletError);
    expect(caught).toMatchObject({ code: 'insufficient-balance' });
  });

  it('is exact beyond float precision', () => {
    const holdings = [h('00a', '9007199254740993.0000000001'), h('00b', '0.0000000001')];
    expect(selectHoldings(holdings, request('9007199254740993.0000000002'))).toEqual({
      inputHoldingCids: ['00a', '00b'],
      selectedTotal: '9007199254740993.0000000002',
      amount: '9007199254740993.0000000002',
    });
    expect(() => selectHoldings(holdings, request('9007199254740993.0000000003'))).toThrow(
      /need 9007199254740993\.0000000003, have 9007199254740993\.0000000002/
    );
  });

  it('covers an amount with many smallest units and normalizes the amount', () => {
    const dust = Array.from({ length: 30 }, (_, i) => h(`00d${String(i).padStart(2, '0')}`, '0.0000000001'));
    const selection = selectHoldings(dust, request(' 0.000000003 '));
    expect(selection.inputHoldingCids).toEqual(dust.map((d) => d.contractId));
    expect(selection.amount).toBe('0.0000000030');
    expect(selection.selectedTotal).toBe('0.0000000030');
  });

  it('ignores holdings whose amount does not parse', () => {
    expect(() => selectHoldings([h('00bad', '1e3'), h('00neg', '-5')], request('1'))).toThrow(/have 0\.0000000000/);
  });

  describe('within the Daml Numeric 10 range (10^28 - 10^-10)', () => {
    const e27 = (n: number): string => `${n}${'0'.repeat(27)}`;
    const MAX = `${'9'.repeat(28)}.${'9'.repeat(10)}`;

    it('takes the smallest holdings first when the largest-first total would overflow', () => {
      // Largest first: 6e27 + 5e27 = 1.1e28, beyond the range; 6e27 + 4e27 = 1e28 is too.
      const holdings = [h('00six', e27(6)), h('00five', e27(5)), h('00four', e27(4))];
      expect(selectHoldings(holdings, request(e27(9)))).toEqual({
        inputHoldingCids: ['00four', '00five'],
        selectedTotal: `${e27(9)}.0000000000`,
        amount: `${e27(9)}.0000000000`,
      });
    });

    it('keeps the largest-first cover when it is representable', () => {
      const holdings = [h('00a', MAX), h('00b', '1')];
      expect(selectHoldings(holdings, request(MAX)).inputHoldingCids).toEqual(['00a']);
    });

    it('refuses locally when no tried cover is representable', () => {
      const holdings = [h('00a', e27(6)), h('00b', e27(6))];
      let caught: unknown;
      try {
        selectHoldings(holdings, request(e27(9)));
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(TokenWalletError);
      expect(caught).toMatchObject({ code: 'amount-out-of-range' });
    });

    it('skips holdings when both the largest-first and smallest-first covers overflow', () => {
      // Largest first: 8e27 + 6e27 overflows; smallest first: 2e27 + 3e27 + 6e27 does too. 6e27 + 3e27 fits.
      const holdings = [h('00two', e27(2)), h('00eight', e27(8)), h('00three', e27(3)), h('00six', e27(6))];
      expect(selectHoldings(holdings, request(e27(9)))).toEqual({
        inputHoldingCids: ['00six', '00three'],
        selectedTotal: `${e27(9)}.0000000000`,
        amount: `${e27(9)}.0000000000`,
      });
    });

    it('takes the skipping cover with the fewest inputs', () => {
      // From 8e27: 8e27 + 5e26 + 5e26 (3 inputs) after skipping 6e27 and 3e27; from 6e27: 6e27 + 3e27 (2 inputs).
      const e26 = (n: number): string => `${n}${'0'.repeat(26)}`;
      const holdings = [
        h('00eight', e27(8)),
        h('00six', e27(6)),
        h('00three', e27(3)),
        h('00half-a', e26(5)),
        h('00half-b', e26(5)),
      ];
      expect(selectHoldings(holdings, request(e27(9))).inputHoldingCids).toEqual(['00six', '00three']);
    });

    it(`searches only the largest ${MAX_SKIPPING_COVER_CANDIDATES} holdings for a skipping cover`, () => {
      // Any two 6e27 holdings overflow and one falls short; the 3e27 holdings that would complete a cover rank last.
      const sixes = Array.from({ length: MAX_SKIPPING_COVER_CANDIDATES }, (_, i) =>
        h(`00six${String(i).padStart(3, '0')}`, e27(6))
      );
      const threes = [h('00three-a', e27(3)), h('00three-b', e27(3))];
      expect(() => selectHoldings([...sixes, ...threes], request(e27(9)))).toThrow(
        `(searched the largest ${MAX_SKIPPING_COVER_CANDIDATES} of ${MAX_SKIPPING_COVER_CANDIDATES + 2} holdings)`
      );
      expect(selectHoldings([...sixes.slice(0, 10), ...threes], request(e27(9))).inputHoldingCids).toEqual([
        '00six000',
        '00three-a',
      ]);
    });

    it('refuses an amount beyond the range', () => {
      expect(requirePositiveAmount(MAX)).toBe(10n ** 38n - 1n);
      expect(() => requirePositiveAmount(`1${'0'.repeat(28)}`)).toThrow(/below 10\^28/);
    });
  });

  it('refuses a non-positive or over-precise amount', () => {
    expect(() => selectHoldings([h('00a', '5')], request('0'))).toThrow(/positive decimal/);
    expect(() => selectHoldings([h('00a', '5')], request('0.00000000001'))).toThrow(/at most 10 decimal places/);
  });
});
