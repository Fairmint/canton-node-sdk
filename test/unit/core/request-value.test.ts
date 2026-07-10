import { cloneRequestValue, deepFreezeRequestValue } from '../../../src/core/http/request-value';

describe('request value snapshots', () => {
  it('rejects cyclic plain request values without overflowing the stack', () => {
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;

    expect(() => cloneRequestValue(cyclic)).toThrow('Cyclic request values are not supported');
  });

  it.each([
    ['custom class', new (class RequestValue {})()],
    ['Map', new Map([['key', 'value']])],
    ['Set', new Set(['value'])],
  ])('rejects unsupported %s instances instead of silently changing their representation', (_name, value) => {
    expect(() => cloneRequestValue(value)).toThrow('Unsupported request value type');
  });

  it('guards recursive freezing when given an already-cyclic object', () => {
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;

    expect(deepFreezeRequestValue(cyclic)).toBe(cyclic);
    expect(Object.isFrozen(cyclic)).toBe(true);
  });
});
