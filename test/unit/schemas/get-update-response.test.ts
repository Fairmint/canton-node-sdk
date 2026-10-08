import { GetUpdateResponseSchema } from '../../../src/clients/ledger-json-api/schemas/api/updates';

const transaction = {
  updateId: 'update-1',
  commandId: 'cmd-1',
  workflowId: '',
  effectiveAt: '2026-01-01T00:00:00Z',
  offset: 10,
  events: [],
  synchronizerId: 'sync-1',
  recordTime: '2026-01-01T00:00:00Z',
};

describe('GetUpdateResponseSchema', () => {
  it('accepts a transaction lookup wrapped as Transaction.value', () => {
    const parsed = GetUpdateResponseSchema.parse({
      update: { Transaction: { value: transaction } },
    });

    expect(parsed.update).toEqual({ Transaction: { value: transaction } });
  });

  it('accepts a non-transaction update variant', () => {
    const parsed = GetUpdateResponseSchema.parse({
      update: { OffsetCheckpoint: { value: { offset: 10, synchronizerTimes: [] } } },
    });

    expect(parsed.update).toEqual({
      OffsetCheckpoint: { value: { offset: 10, synchronizerTimes: [] } },
    });
  });

  it('rejects the JsTransaction discriminator', () => {
    expect(GetUpdateResponseSchema.safeParse({ update: { JsTransaction: transaction } }).success).toBe(false);
  });
});
