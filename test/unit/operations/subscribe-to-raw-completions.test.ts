import {
  SubscribeToRawCompletions,
  type RawCompletionFrame,
  type SubscribeToRawCompletionsParams,
} from '../../../src/clients/ledger-json-api/operations/v2/commands/subscribe-to-raw-completions';
import { ValidationError } from '../../../src/core/errors';

const mockConnect = jest.fn();

jest.mock('../../../src/core/ws/WebSocketClient', () => ({
  WebSocketClient: class {
    public connect(...args: unknown[]): unknown {
      return mockConnect(...args);
    }
  },
}));

interface Handlers {
  onMessage: (message: unknown, rawText?: string) => void;
  onClose?: (code: number, reason: string) => void;
}

function respondWith(texts: string[], closeCode = 1000): void {
  mockConnect.mockImplementation(async (_path: string, _request: unknown, handlers: Handlers): Promise<unknown> => {
    for (const text of texts) handlers.onMessage(JSON.parse(text), text);
    handlers.onClose?.(closeCode, '');
    return Promise.resolve({ close: jest.fn(), isConnected: () => false, getConnectionState: () => 3 });
  });
}

const PARAMS: Omit<SubscribeToRawCompletionsParams, 'onFrame'> = {
  userId: 'ta-service',
  parties: ['Alice::1', 'Bob::1'],
  beginExclusive: 10,
};

const ACCEPTED =
  '{"completionResponse":{"Completion":{"value":{"commandId":"c1","updateId":"1220aa","userId":"ta-service",' +
  '"actAs":["Alice::1"],"submissionId":"s1","offset":11,"paidTrafficCost":7,"traceContext":null,' +
  '"synchronizerTime":{"synchronizerId":"sync::1","recordTime":"2026-11-02T10:00:00Z"}}}}}';
const REJECTED =
  '{"completionResponse":{"Completion":{"value":{"commandId":"c2","status":{"code":6,"message":"DUPLICATE_COMMAND",' +
  '"details":[]},"userId":"ta-service","actAs":["Bob::1"],"offset":12,"paidTrafficCost":null,' +
  '"synchronizerTime":{"synchronizerId":"sync::1","recordTime":"2026-11-02T10:00:01Z"}}}}}';
const CHECKPOINT = '{"completionResponse":{"OffsetCheckpoint":{"value":{"offset":20,"synchronizerTimes":[]}}}}';
const EMPTY = '{"completionResponse":{"Empty":{}}}';

describe('SubscribeToRawCompletions', () => {
  beforeEach(() => {
    mockConnect.mockReset();
  });

  it('sends userId, parties and beginExclusive exactly, without consulting the client configuration', async () => {
    respondWith([]);
    const client = { buildPartyList: jest.fn(), getUserId: jest.fn() };

    await new SubscribeToRawCompletions(client as never).connect({ ...PARAMS, onFrame: jest.fn() }).done;

    expect(mockConnect).toHaveBeenCalledWith(
      '/v2/commands/completions',
      { userId: 'ta-service', parties: ['Alice::1', 'Bob::1'], beginExclusive: 10 },
      expect.any(Object),
      expect.objectContaining({ idleTimeoutMs: 0 })
    );
    expect(client.buildPartyList).not.toHaveBeenCalled();
    expect(client.getUserId).not.toHaveBeenCalled();
  });

  it('delivers accepted and rejected completions, checkpoints and empty responses exactly', async () => {
    respondWith([ACCEPTED, REJECTED, EMPTY, CHECKPOINT]);
    const frames: RawCompletionFrame[] = [];

    const stream = new SubscribeToRawCompletions({} as never).connect({
      ...PARAMS,
      onFrame: (frame) => void frames.push(frame),
    });

    await expect(stream.done).resolves.toEqual({ reason: 'completed', lastOffset: 20, closeCode: 1000 });
    expect(frames.map((f) => [f.kind, f.offset])).toEqual([
      ['Completion', 11],
      ['Completion', 12],
      ['Empty', undefined],
      ['OffsetCheckpoint', 20],
    ]);
    expect(frames.map((f) => f.text)).toEqual([ACCEPTED, REJECTED, EMPTY, CHECKPOINT]);
    expect(frames[1]?.json).toHaveProperty('completionResponse.Completion.value.paidTrafficCost', null);
  });

  it('rejects a completion without an offset', async () => {
    respondWith(['{"completionResponse":{"Completion":{"value":{"commandId":"c1"}}}}']);

    await expect(
      new SubscribeToRawCompletions({} as never).connect({ ...PARAMS, onFrame: jest.fn() }).done
    ).rejects.toMatchObject({ reason: 'unexpected-frame' });
  });

  it.each([
    ['an empty parties list', { parties: [] }],
    ['an empty party', { parties: [''] }],
    ['an empty userId', { userId: '' }],
    ['a missing userId', { userId: undefined }],
    ['a missing beginExclusive', { beginExclusive: undefined }],
  ])('throws a ValidationError for %s instead of falling back', (_name, override) => {
    const params = { ...PARAMS, ...override, onFrame: jest.fn() } as unknown as SubscribeToRawCompletionsParams;
    expect(() => new SubscribeToRawCompletions({} as never).connect(params)).toThrow(ValidationError);
    expect(mockConnect).not.toHaveBeenCalled();
  });
});
