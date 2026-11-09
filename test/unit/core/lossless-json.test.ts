import { CantonError } from '../../../src/core/errors';
import {
  LossyJsonError,
  assertLosslessJson,
  parseJsonLosslessly,
  parseJsonLosslesslyWithElements,
} from '../../../src/core/utils';

describe('parseJsonLosslessly', () => {
  it('returns JSON.parse output for JSON whose numbers and keys all survive', () => {
    const text =
      '{"update":{"Transaction":{"value":{"offset":7579338,"paidTrafficCost":0,"nodeId":-1,"ratio":0.25,' +
      '"commandId":"cmd \\"1\\" 9007199254740993 1e5","events":[true,false,null,{"a":1},{"a":2}],"empty":{},"list":[]}}}}';
    expect(parseJsonLosslessly(text)).toEqual(JSON.parse(text));
  });

  it('ignores digits, escapes and braces inside strings, and the letters of literals', () => {
    expect(() => {
      assertLosslessJson('{"k":"} { [ 1.0 , \\\\","t":true,"f":false,"n":null,"e":"1e400"}');
    }).not.toThrow();
  });

  it('rejects an integer that JavaScript cannot hold exactly', () => {
    expect(() => parseJsonLosslessly('{"paidTrafficCost":9007199254740993}')).toThrow(LossyJsonError);
    expect(() => parseJsonLosslessly('{"paidTrafficCost":9007199254740993}')).toThrow(
      /9007199254740993 does not survive JSON.parse exactly \(it reads back as 9007199254740992\)/
    );
  });

  it.each(['1.0', '1e3', '-0', '1.50', '1E2', '0.10000000000000001'])('rejects the rewritten number %s', (token) => {
    expect(() => parseJsonLosslessly(`[${token}]`)).toThrow(LossyJsonError);
  });

  it.each([
    ['9223372036854775000', '9223372036854774784'],
    ['1152921504606847000', '1152921504606846976'],
    ['-9223372036854775000', '-9223372036854774784'],
  ])('rejects the integer %s, which JavaScript writes back unchanged but holds as %s', (token, held) => {
    // The trap: the text survives a round trip through JavaScript, the integer does not.
    expect(String(Number(token))).toBe(token);
    expect(BigInt(Number(token)).toString()).toBe(held);
    expect(() => parseJsonLosslessly(`{"paidTrafficCost":${token}}`)).toThrow(LossyJsonError);
    expect(() => parseJsonLosslessly(`[${token}]`)).toThrow(`(it reads back as ${held})`);
  });

  it.each([
    ['1e+23', '99999999999999991611392'],
    ['-1e+23', '-99999999999999991611392'],
    ['1.2345678901234566e+25', '12345678901234566097272832'],
  ])('rejects the integer %s written in exponent form, which JavaScript holds as %s', (token, held) => {
    // The same trap in exponent form: JavaScript writes the token back unchanged, but holds a different integer.
    expect(String(Number(token))).toBe(token);
    expect(BigInt(Number(token)).toString()).toBe(held);
    expect(() => parseJsonLosslessly(`[${token}]`)).toThrow(`(it reads back as ${held})`);
  });

  it.each([
    ['1e10000000000000000000000', 'Infinity'],
    ['-1e10000000000000000000000', '-Infinity'],
    ['1e-10000000000000000000000', '0'],
  ])('rejects the overflowing or underflowing number %s without expanding its exponent', (token, held) => {
    expect(() => parseJsonLosslessly(`[${token}]`)).toThrow(LossyJsonError);
    expect(() => parseJsonLosslessly(`[${token}]`)).toThrow(`(it reads back as ${held})`);
  });

  it('accepts integers in exponent form that JavaScript holds exactly', () => {
    // 10^21 and 10^22 are 2^n * 5^n with 5^n below 2^53, so a double holds them exactly.
    expect(parseJsonLosslessly('[1e+21,1e+22,-1e+22]')).toEqual([1e21, 1e22, -1e22]);
  });

  it('accepts integers above 2^53 that JavaScript holds exactly and writes back unchanged', () => {
    expect(parseJsonLosslessly('[9007199254740992,-9007199254740992,100000000000000000000]')).toEqual([
      2 ** 53,
      -(2 ** 53),
      1e20,
    ]);
  });

  it('rejects an integer JavaScript holds but writes back differently', () => {
    // 2^60 exactly; JavaScript writes it as 1152921504606847000, so serializing the parsed value would change it.
    expect(() => parseJsonLosslessly('[1152921504606846976]')).toThrow('(it reads back as 1152921504606847000)');
  });

  it('accepts the largest exact integers', () => {
    expect(parseJsonLosslessly('[9007199254740991,-9007199254740991]')).toEqual([
      Number.MAX_SAFE_INTEGER,
      Number.MIN_SAFE_INTEGER,
    ]);
  });

  it('rejects a repeated key, including one spelled with an escape', () => {
    expect(() => parseJsonLosslessly('{"a":1,"b":2,"a":3}')).toThrow(/repeats the key "a"/);
    expect(() => parseJsonLosslessly('{"ab":1,"a\\u0062":2}')).toThrow(LossyJsonError);
  });

  it('allows the same key in different objects and string values equal to keys', () => {
    expect(() => parseJsonLosslessly('{"a":{"a":"a"},"b":[{"a":1},{"a":2}],"c":"a"}')).not.toThrow();
  });

  it('throws a SyntaxError for text that is not JSON', () => {
    expect(() => parseJsonLosslessly('{"a":')).toThrow(SyntaxError);
  });

  it('is a CantonError with the LOSSY_JSON code', () => {
    try {
      assertLosslessJson('[1.0]');
      throw new Error('expected a LossyJsonError');
    } catch (error) {
      expect(error).toBeInstanceOf(CantonError);
      expect((error as LossyJsonError).code).toBe('LOSSY_JSON');
    }
  });
});

describe('parseJsonLosslesslyWithElements', () => {
  it("returns each element of the root object's array exactly as written", () => {
    const items = [
      '{"update":{"m":{"10":1,"2":2}}}',
      '{ "update" : { "k" : [ 1 , "a,]\\"" ] } }',
      '7',
      '"s"',
      'null',
      '[]',
    ];
    const text = `{"before":[0],"updates":[ ${items[0]},\n${items[1]} ,${items[2]},${items[3]},${items[4]},${items[5]}],"after":{"updates":[9]}}`;

    const { value, elements } = parseJsonLosslesslyWithElements(text, 'updates');

    expect(value).toStrictEqual(JSON.parse(text));
    expect(elements).toEqual(items);
    // Re-serializing the parsed value would not give the bytes back: integer-like keys move first.
    expect(JSON.stringify((JSON.parse(text) as { updates: unknown[] }).updates[0])).not.toBe(items[0]);
  });

  it('returns no elements for an empty array, and undefined without one', () => {
    expect(parseJsonLosslesslyWithElements('{"updates":[ ]}', 'updates').elements).toEqual([]);
    expect(parseJsonLosslesslyWithElements('{"updates":{}}', 'updates').elements).toBeUndefined();
    expect(parseJsonLosslesslyWithElements('{"other":[1]}', 'updates').elements).toBeUndefined();
    expect(parseJsonLosslesslyWithElements('[{"updates":[1]}]', 'updates').elements).toBeUndefined();
  });

  it('still rejects a lossy number inside an element', () => {
    expect(() => parseJsonLosslesslyWithElements('{"updates":[{"o":9223372036854775000}]}', 'updates')).toThrow(
      LossyJsonError
    );
  });
});
