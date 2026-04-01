import { getPaidTrafficCostFromCompletion } from '../../../src/utils/traffic/paid-traffic-cost';
import { type Completion } from '../../../src/clients/ledger-json-api/schemas/api/completions';

function makeCompletion(paidTrafficCost?: number): Completion {
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
});
