import { getPaidTrafficCostFromCompletion } from '../../../src/utils/traffic/paid-traffic-cost';
import {
  CompletionSchema,
  type Completion,
} from '../../../src/clients/ledger-json-api/schemas/api/completions';
import { ledgerPaidTrafficCostSchema } from '../../../src/clients/ledger-json-api/schemas/wire';

function makeCompletion(paidTrafficCost?: string): Completion {
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
    expect(getPaidTrafficCostFromCompletion(makeCompletion('42'))).toBe(42n);
  });

  it('returns bigint for a decimal string (int64 JSON encoding)', () => {
    expect(getPaidTrafficCostFromCompletion(makeCompletion('9007199254740993'))).toBe(9007199254740993n);
  });

  it('returns undefined for a non-digit string', () => {
    const completion = makeCompletion();
    Object.assign(completion.value, { paidTrafficCost: '42.5' });
    expect(getPaidTrafficCostFromCompletion(completion)).toBeUndefined();
  });
});

describe('paidTrafficCost schema rejects negatives', () => {
  it('rejects -1 on ledgerPaidTrafficCostSchema', () => {
    expect(ledgerPaidTrafficCostSchema.safeParse(-1).success).toBe(false);
    expect(ledgerPaidTrafficCostSchema.safeParse('-1').success).toBe(false);
  });

  it('accepts 0 on ledgerPaidTrafficCostSchema', () => {
    expect(ledgerPaidTrafficCostSchema.safeParse(0).success).toBe(true);
    expect(ledgerPaidTrafficCostSchema.safeParse('0').success).toBe(true);
  });

  it('rejects -1 on CompletionSchema paidTrafficCost', () => {
    const result = CompletionSchema.safeParse({
      value: {
        commandId: 'cmd-1',
        offset: 1,
        synchronizerTime: { synchronizerId: 'sync', recordTime: '1970-01-01T00:00:00Z' },
        paidTrafficCost: -1,
      },
    });
    expect(result.success).toBe(false);
  });

  it('normalizes LocalNet null W3C fields and paidTrafficCost number wire', () => {
    const result = CompletionSchema.safeParse({
      value: {
        commandId: 'cmd-1',
        submissionId: 'sub-1',
        offset: 1,
        synchronizerTime: { synchronizerId: 'sync', recordTime: '1970-01-01T00:00:00Z' },
        traceContext: { traceparent: null, tracestate: null },
        paidTrafficCost: 17,
      },
    });
    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }
    expect(result.data.value.paidTrafficCost).toBe('17');
    expect(result.data.value.traceContext?.tracestate).toBeUndefined();
    expect(result.data.value.traceContext?.traceparent).toBeUndefined();
  });
});
