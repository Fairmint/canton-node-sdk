import { getPaidTrafficCostFromCompletion } from '../../../src/utils/traffic/paid-traffic-cost';
import { type Completion } from '../../../src/clients/ledger-json-api/schemas/api/completions';

function makeCompletion(paidTrafficCost?: number | string): Completion {
  return {
    value: {
      commandId: 'cmd-1',
      offset: 1,
      synchronizerTime: { synchronizerId: 'sync', recordTime: '1970-01-01T00:00:00Z' },
      ...(paidTrafficCost !== undefined ? { paidTrafficCost } : {}),
    },
  };
}

describe('getPaidTrafficCostFromCompletion', () => {
  it('returns undefined when the field is absent', () => {
    expect(getPaidTrafficCostFromCompletion(makeCompletion())).toBeUndefined();
  });

  it('returns bigint when present', () => {
    expect(getPaidTrafficCostFromCompletion(makeCompletion(42))).toBe(42n);
  });

  it('returns undefined for a non-integer number', () => {
    expect(getPaidTrafficCostFromCompletion(makeCompletion(42.5))).toBeUndefined();
  });

  it('returns undefined when the number is not a safe integer', () => {
    expect(getPaidTrafficCostFromCompletion(makeCompletion(Number.MAX_SAFE_INTEGER + 1))).toBeUndefined();
  });

  it('returns bigint for a decimal string (int64 JSON encoding)', () => {
    expect(getPaidTrafficCostFromCompletion(makeCompletion('9007199254740993'))).toBe(9007199254740993n);
  });
});
