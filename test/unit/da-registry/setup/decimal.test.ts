import { formatDecimal, parseDecimal, sumDecimals } from '../../../../src/da-registry/setup/decimal';

describe('setup decimals', () => {
  it.each([
    ['1000000', '1000000'],
    ['10000.0000000000', '10000'],
    ['10.50', '10.5'],
    ['0.0000000001', '0.0000000001'],
    ['-2.5', '-2.5'],
    ['007', '7'],
  ])('reads %s back as %s', (input, output) => {
    expect(formatDecimal(parseDecimal(input))).toBe(output);
  });

  it('adds and subtracts exactly where floating point would not', () => {
    const total = sumDecimals([parseDecimal('0.1'), parseDecimal('0.2')]);
    expect(formatDecimal(total)).toBe('0.3');
    expect(formatDecimal(parseDecimal('10000') - parseDecimal('9999.9999999999'))).toBe('0.0000000001');
  });

  it('reads a long run of trailing zeros in linear time', () => {
    expect(formatDecimal(parseDecimal(`1.${'0'.repeat(200_000)}`))).toBe('1');
  });

  it.each(['', 'abc', '1e3', '1.', '.5', '0.00000000001'])('rejects %j', (input) => {
    expect(() => parseDecimal(input)).toThrow();
  });
});
