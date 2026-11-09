import {
  SubscribeToRawUpdates,
  type RawUpdateFrame,
  type SubscribeToRawUpdatesParams,
} from '../../../src/clients/ledger-json-api/operations/v2/updates/subscribe-to-raw-updates';
import { buildUpdateFormat } from '../../../src/clients/ledger-json-api/operations/v2/utils/event-format-builder';
import {
  RAW_STREAM_HIGH_WATER_MARK,
  RawStreamError,
} from '../../../src/clients/ledger-json-api/operations/v2/utils/raw-frame-stream';
import { ValidationError } from '../../../src/core/errors';
import { type WebSocketOptions } from '../../../src/core/ws/WebSocketClient';

const mockConnect = jest.fn();

jest.mock('../../../src/core/ws/WebSocketClient', () => ({
  WebSocketClient: class {
    public connect(...args: unknown[]): unknown {
      return mockConnect(...args);
    }
  },
}));

interface Handlers {
  onMessage: (message: unknown, rawText?: string) => void | Promise<void>;
  onError?: (error: Error) => void;
  onClose?: (code: number, reason: string) => void;
}

interface Connection {
  readonly path: string;
  readonly request: unknown;
  readonly handlers: Handlers;
  readonly options: WebSocketOptions;
  readonly subscription: { close: jest.Mock; pause: jest.Mock; resume: jest.Mock };
  /** Delivers a frame as the WebSocket client does: its JSON.parse value and its text. */
  send: (text: string) => void;
}

/** Captures the connection the stream opens; resolves once `connect` has been called. */
async function captureConnection(): Promise<Connection> {
  return new Promise<Connection>((resolve) => {
    mockConnect.mockImplementation(
      async (path: string, request: unknown, handlers: Handlers, options: WebSocketOptions): Promise<unknown> => {
        const subscription = {
          close: jest.fn(),
          pause: jest.fn(),
          resume: jest.fn(),
          isConnected: (): boolean => true,
          getConnectionState: (): number => 1,
        };
        resolve({
          path,
          request,
          handlers,
          options,
          subscription,
          send: (text: string): void => {
            void handlers.onMessage(JSON.parse(text), text);
          },
        });
        return Promise.resolve(subscription);
      }
    );
  });
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

const SYNC = 'global-domain::1220abcd';

/** A Transaction frame as the participant writes it: explicit nulls, a number paidTrafficCost, its own spacing. */
function transactionText(offset: number, extra = ''): string {
  return (
    `{"update":{"Transaction":{"value":{"updateId":"1220tx${offset}","commandId":"","workflowId":"",` +
    `"effectiveAt":"2026-11-02T10:00:00.123456Z","offset":${offset},"synchronizerId":"${SYNC}",` +
    `"recordTime":"2026-11-02T10:00:00.234567Z","traceContext":null,"externalTransactionHash":null,` +
    `"paidTrafficCost":0,"events":[]${extra}}}}}`
  );
}

function checkpointText(offset: number): string {
  return (
    `{"update":{"OffsetCheckpoint":{"value":{"offset":${offset},` +
    `"synchronizerTimes":[{"synchronizerId":"${SYNC}","recordTime":"2026-11-02T10:01:00Z"}]}}}}`
  );
}

function reassignmentText(offset: number): string {
  return (
    `{"update":{"Reassignment":{"value":{"updateId":"1220re${offset}","offset":${offset},"commandId":"",` +
    `"workflowId":"","recordTime":"2026-11-02T10:00:00Z","synchronizerId":"${SYNC}","traceContext":null,` +
    `"paidTrafficCost":null,"events":[{"JsUnassignedEvent":{"value":{"offset":${offset},"nodeId":0,` +
    `"contractId":"00ab","templateId":"pkg:Mod:T","source":"${SYNC}","target":"other::1",` +
    `"reassignmentId":"r1","submitter":"Alice::1","reassignmentCounter":1,"packageName":"p",` +
    `"witnessParties":["Alice::1"]}}}]}}}}`
  );
}

function topologyText(offset: number): string {
  return (
    `{"update":{"TopologyTransaction":{"value":{"updateId":"1220to${offset}","offset":${offset},` +
    `"synchronizerId":"${SYNC}","recordTime":"2026-11-02T10:00:00Z","events":[{"event":` +
    `{"ParticipantAuthorizationAdded":{"value":{"partyId":"Bob::1","participantId":"PAR::1",` +
    `"participantPermission":"PARTICIPANT_PERMISSION_SUBMISSION"}}}}],"traceContext":null}}}}`
  );
}

const UPDATE_FORMAT = buildUpdateFormat({ anyParty: true, includeCreatedEventBlob: true, includeTopologyEvents: true });

function client(): { clearToken: jest.Mock } {
  return { clearToken: jest.fn() };
}

function open(
  params: Partial<SubscribeToRawUpdatesParams> & Pick<SubscribeToRawUpdatesParams, 'onFrame'>,
  ledger = client()
): ReturnType<SubscribeToRawUpdates['connect']> {
  return new SubscribeToRawUpdates(ledger as never).connect({
    updateFormat: UPDATE_FORMAT,
    beginExclusive: 100,
    ...params,
  });
}

describe('SubscribeToRawUpdates', () => {
  beforeEach(() => {
    mockConnect.mockReset();
  });

  it('sends the update format exactly as given, with the range, and always schedules a token refresh', async () => {
    const connection = captureConnection();
    open({ beginExclusive: 100, endInclusive: 200, idleTimeoutMs: 300_000, onFrame: jest.fn() });
    const { path, request, options } = await connection;

    expect(path).toBe('/v2/updates');
    expect(request).toEqual({ beginExclusive: 100, endInclusive: 200, updateFormat: UPDATE_FORMAT });
    expect((request as { updateFormat: unknown }).updateFormat).toBe(UPDATE_FORMAT);
    expect(options.idleTimeoutMs).toBe(300_000);
    expect(typeof options.onTokenRefreshNeeded).toBe('function');
  });

  it('delivers every kind exactly as received: text, unnormalized JSON, kind and offset', async () => {
    const connection = captureConnection();
    const frames: RawUpdateFrame[] = [];
    const stream = open({ onFrame: (frame) => void frames.push(frame) });
    const { send, handlers } = await connection;

    const texts = [
      transactionText(101),
      reassignmentText(102),
      topologyText(103),
      checkpointText(103),
      '{"update":{"FutureKind":{"value":{"note":"no offset"}}}}',
    ];
    texts.forEach(send);
    handlers.onClose?.(1000, '');

    await expect(stream.done).resolves.toEqual({ reason: 'completed', lastOffset: 103, closeCode: 1000 });
    expect(frames.map((f) => [f.kind, f.offset])).toEqual([
      ['Transaction', 101],
      ['Reassignment', 102],
      ['TopologyTransaction', 103],
      ['OffsetCheckpoint', 103],
      ['FutureKind', undefined],
    ]);
    expect(frames.map((f) => f.text)).toEqual(texts);
    frames.forEach((frame, index) => {
      expect(frame.json).toStrictEqual(JSON.parse(texts[index] ?? ''));
    });
    // No normalization: nulls stay null and paidTrafficCost stays the number the participant sent.
    const tx = (frames[0]?.json as { update: { Transaction: { value: Record<string, unknown> } } }).update.Transaction
      .value;
    expect(tx['traceContext']).toBeNull();
    expect(tx['externalTransactionHash']).toBeNull();
    expect(tx['paidTrafficCost']).toBe(0);
    const re = (frames[1]?.json as { update: { Reassignment: { value: Record<string, unknown> } } }).update.Reassignment
      .value;
    expect(re['paidTrafficCost']).toBeNull();
  });

  it('keeps unknown fields of known kinds', async () => {
    const connection = captureConnection();
    const frames: RawUpdateFrame[] = [];
    const stream = open({ onFrame: (frame) => void frames.push(frame) });
    const { send, handlers } = await connection;

    send(transactionText(101, ',"transactionHash":"abc","futureField":{"x":[1,2]}'));
    handlers.onClose?.(1000, '');
    await stream.done;

    expect(frames[0]?.json).toHaveProperty('update.Transaction.value.transactionHash', 'abc');
    expect(frames[0]?.json).toHaveProperty('update.Transaction.value.futureField', { x: [1, 2] });
  });

  it('hands frames to onFrame one at a time, in order, and moves lastOffset only once a frame is handled', async () => {
    const connection = captureConnection();
    const gates = [deferred(), deferred()];
    const started: number[] = [];
    const stream = open({
      onFrame: async (frame) => {
        started.push(frame.offset ?? -1);
        await gates[started.length - 1]?.promise;
      },
    });
    const { send, handlers } = await connection;

    send(transactionText(101));
    send(transactionText(105));
    await flush();
    expect(started).toEqual([101]);
    expect(stream.lastOffset).toBe(100);

    gates[0]?.resolve();
    await flush();
    expect(started).toEqual([101, 105]);
    expect(stream.lastOffset).toBe(101);

    gates[1]?.resolve();
    await flush();
    expect(stream.lastOffset).toBe(105);

    handlers.onClose?.(1000, '');
    await expect(stream.done).resolves.toEqual({ reason: 'completed', lastOffset: 105, closeCode: 1000 });
  });

  it('handles the frames received before a normal close before resolving', async () => {
    const connection = captureConnection();
    const gate = deferred();
    const handled: number[] = [];
    const stream = open({
      onFrame: async (frame) => {
        await gate.promise;
        handled.push(frame.offset ?? -1);
      },
    });
    const { send, handlers } = await connection;

    send(transactionText(101));
    send(transactionText(102));
    handlers.onClose?.(1000, '');
    let settled = false;
    void stream.done.then(() => {
      settled = true;
    });
    await flush();
    expect(settled).toBe(false);

    gate.resolve();
    await expect(stream.done).resolves.toEqual({ reason: 'completed', lastOffset: 102, closeCode: 1000 });
    expect(handled).toEqual([101, 102]);
  });

  it('never moves lastOffset back for a checkpoint below it', async () => {
    const connection = captureConnection();
    const stream = open({ onFrame: jest.fn() });
    const { send, handlers } = await connection;

    send(transactionText(110));
    send(checkpointText(90));
    handlers.onClose?.(1000, '');

    await expect(stream.done).resolves.toMatchObject({ lastOffset: 110 });
  });

  it('rejects an update whose offset does not follow the previous frame, after handling the frames before it', async () => {
    const connection = captureConnection();
    const onFrame = jest.fn();
    const stream = open({ onFrame });
    const { send, subscription } = await connection;

    send(transactionText(105));
    send(checkpointText(108));
    send(transactionText(108));

    const error = await stream.done.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RawStreamError);
    expect((error as RawStreamError).reason).toBe('out-of-order');
    expect(onFrame).toHaveBeenCalledTimes(2);
    expect(stream.lastOffset).toBe(108);
    expect(subscription.close).toHaveBeenCalled();
  });

  it('rejects an update at or before beginExclusive', async () => {
    const connection = captureConnection();
    const stream = open({ beginExclusive: 100, onFrame: jest.fn() });
    (await connection).send(transactionText(100));

    await expect(stream.done).rejects.toMatchObject({ reason: 'out-of-order' });
  });

  it('rejects an error frame with its Canton code, after handling the frames before it', async () => {
    const connection = captureConnection();
    const onFrame = jest.fn();
    const stream = open({ onFrame });
    const { send, subscription } = await connection;

    send(transactionText(101));
    send(
      '{"code":"PARTICIPANT_PRUNED_DATA_ACCESSED","cause":"pruned up to 150","correlationId":null,' +
        '"traceId":null,"context":{},"resources":[],"errorCategory":9,"grpcCodeValue":9,"retryInfo":null,' +
        '"definiteAnswer":null}'
    );
    send(transactionText(102));

    const error = await stream.done.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RawStreamError);
    expect(error).toMatchObject({ reason: 'error-frame', ledgerCode: 'PARTICIPANT_PRUNED_DATA_ACCESSED' });
    expect((error as RawStreamError).message).toContain('pruned up to 150');
    expect((error as RawStreamError).context).toMatchObject({ code: 'PARTICIPANT_PRUNED_DATA_ACCESSED' });
    expect(onFrame).toHaveBeenCalledTimes(1);
    expect(stream.lastOffset).toBe(101);
    expect(subscription.close).toHaveBeenCalled();
  });

  it('rejects a JsCantonError-shaped error frame too', async () => {
    const connection = captureConnection();
    const stream = open({ onFrame: jest.fn() });
    (await connection).send('{"code":{"kind":{"JsInvalidArgument":{}}},"message":"bad filter"}');

    await expect(stream.done).rejects.toMatchObject({ reason: 'error-frame', ledgerCode: undefined });
  });

  it('rejects a frame whose numbers JSON.parse would change', async () => {
    const connection = captureConnection();
    const onFrame = jest.fn();
    const stream = open({ onFrame });
    (await connection).send(transactionText(101).replace('"paidTrafficCost":0', '"paidTrafficCost":9007199254740993'));

    await expect(stream.done).rejects.toMatchObject({ reason: 'lossy-json' });
    expect(onFrame).not.toHaveBeenCalled();
  });

  it.each([
    ['a frame without "update"', '{"something":1}'],
    [
      'two kinds in one frame',
      '{"update":{"Transaction":{"value":{"offset":101}},"Reassignment":{"value":{"offset":102}}}}',
    ],
    ['a known kind without an offset', '{"update":{"Transaction":{"value":{"updateId":"x"}}}}'],
    ['a fractional offset', '{"update":{"Transaction":{"value":{"offset":101.5}}}}'],
    ['a JSON array', '[1,2]'],
  ])('rejects %s as unexpected', async (_name, text) => {
    const connection = captureConnection();
    const stream = open({ onFrame: jest.fn() });
    (await connection).send(text);

    await expect(stream.done).rejects.toMatchObject({ reason: 'unexpected-frame' });
  });

  it('rejects an abnormal close with its code, after handling the frames before it', async () => {
    const connection = captureConnection();
    const stream = open({ onFrame: jest.fn() });
    const { send, handlers } = await connection;

    send(transactionText(101));
    handlers.onClose?.(1006, 'connection lost');

    const error = await stream.done.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RawStreamError);
    expect(error).toMatchObject({ reason: 'abnormal-close', closeCode: 1006 });
    expect(stream.lastOffset).toBe(101);
  });

  it('ends with token-refresh, clears the token and calls the caller hooks, when the refresh timer fires', async () => {
    const connection = captureConnection();
    const ledger = client();
    const onTokenRefreshNeeded = jest.fn().mockReturnValue({ code: 4000, reason: 'refresh' });
    const stream = open({ onFrame: jest.fn(), onTokenRefreshNeeded }, ledger);
    const { send, handlers, options } = await connection;

    send(transactionText(101));
    await expect(options.onTokenRefreshNeeded?.()).resolves.toEqual({ code: 4000, reason: 'refresh' });
    expect(onTokenRefreshNeeded).toHaveBeenCalledTimes(1);
    expect(ledger.clearToken).toHaveBeenCalledTimes(1);
    // The client closes the socket with 4000; a paused socket may report 1006 instead. Both are a token refresh.
    handlers.onClose?.(1006, '');

    await expect(stream.done).resolves.toEqual({ reason: 'token-refresh', lastOffset: 101, closeCode: 1006 });
  });

  it('rejects with the error the refresh hook threw rather than ending with token-refresh', async () => {
    const connection = captureConnection();
    const ledger = client();
    const failure = new Error('could not save the cursor');
    const stream = open({ onFrame: jest.fn(), onTokenRefreshNeeded: async () => Promise.reject(failure) }, ledger);
    const { send, handlers, options } = await connection;

    send(transactionText(101));
    await expect(options.onTokenRefreshNeeded?.()).rejects.toBe(failure);
    // The expiring token is cleared all the same.
    expect(ledger.clearToken).toHaveBeenCalledTimes(1);
    // As the WebSocket client does: it reports the hook's error, then closes the socket for the refresh.
    handlers.onError?.(failure);
    handlers.onClose?.(4000, 'Token refresh required');

    await expect(stream.done).rejects.toBe(failure);
    expect(stream.lastOffset).toBe(101);
  });

  it('rejects with the error onFrame threw, keeps lastOffset at the frame before, and drops the rest', async () => {
    const connection = captureConnection();
    const failure = new Error('database down');
    const seen: number[] = [];
    const stream = open({
      onFrame: (frame) => {
        seen.push(frame.offset ?? -1);
        if (frame.offset === 102) throw failure;
      },
    });
    const { send, subscription } = await connection;

    send(transactionText(101));
    send(transactionText(102));
    send(transactionText(103));

    await expect(stream.done).rejects.toBe(failure);
    expect(seen).toEqual([101, 102]);
    expect(stream.lastOffset).toBe(101);
    expect(subscription.close).toHaveBeenCalled();
  });

  it('close() waits for the frame being handled, counts it, and drops the queued ones', async () => {
    const connection = captureConnection();
    const gate = deferred();
    const seen: number[] = [];
    const stream = open({
      onFrame: async (frame) => {
        seen.push(frame.offset ?? -1);
        await gate.promise;
      },
    });
    const { send, subscription } = await connection;

    send(transactionText(101));
    send(transactionText(102));
    await flush();
    stream.close();
    stream.close();
    expect(subscription.close).toHaveBeenCalled();
    gate.resolve();

    await expect(stream.done).resolves.toEqual({ reason: 'closed', lastOffset: 101, closeCode: undefined });
    expect(seen).toEqual([101]);
  });

  it('stops reading while the consumer is a high-water mark behind and resumes at half', async () => {
    const connection = captureConnection();
    const gate = deferred();
    const stream = open({
      onFrame: async (frame) => {
        if (frame.offset === 101) await gate.promise;
      },
    });
    const { send, handlers, subscription } = await connection;
    await flush();

    for (let i = 0; i <= RAW_STREAM_HIGH_WATER_MARK; i += 1) send(transactionText(101 + i));
    expect(subscription.pause).toHaveBeenCalledTimes(1);
    expect(subscription.resume).not.toHaveBeenCalled();

    gate.resolve();
    handlers.onClose?.(1000, '');
    await expect(stream.done).resolves.toMatchObject({ lastOffset: 101 + RAW_STREAM_HIGH_WATER_MARK });
    expect(subscription.resume).toHaveBeenCalledTimes(1);
  });

  it('resumes reading once half of the waiting frames are handled, not only when all are', async () => {
    const connection = captureConnection();
    const gates = new Map<number, ReturnType<typeof deferred>>();
    const handled: number[] = [];
    const stream = open({
      onFrame: async (frame) => {
        const offset = frame.offset ?? -1;
        await gates.get(offset)?.promise;
        handled.push(offset);
      },
    });
    const { send, handlers, subscription } = await connection;
    await flush();

    // The first frame blocks until released; the rest wait in the queue, which reaches the high-water mark.
    const half = RAW_STREAM_HIGH_WATER_MARK / 2;
    const first = 101;
    const lastQueued = first + RAW_STREAM_HIGH_WATER_MARK;
    gates.set(first, deferred());
    // Block again on the frame that is handed out when exactly half of the queue is still waiting.
    const blockAt = first + RAW_STREAM_HIGH_WATER_MARK - half;
    gates.set(blockAt, deferred());
    for (let offset = first; offset <= lastQueued; offset += 1) send(transactionText(offset));
    await flush();
    expect(subscription.pause).toHaveBeenCalledTimes(1);

    gates.get(first)?.resolve();
    await flush();
    // Reading resumed while `half` frames were still waiting, before the queue drained.
    expect(handled).toHaveLength(blockAt - first);
    expect(subscription.resume).toHaveBeenCalledTimes(1);

    gates.get(blockAt)?.resolve();
    handlers.onClose?.(1000, '');
    await expect(stream.done).resolves.toMatchObject({ reason: 'completed', lastOffset: lastQueued });
    expect(subscription.resume).toHaveBeenCalledTimes(1);
  });

  it('pauses a socket that delivered a high-water mark of frames before it was attached', async () => {
    const connection = captureConnection();
    const gate = deferred();
    const stream = open({ onFrame: async () => gate.promise });
    const { send, handlers, subscription } = await connection;

    for (let i = 0; i <= RAW_STREAM_HIGH_WATER_MARK; i += 1) send(transactionText(101 + i));
    await flush();
    expect(subscription.pause).toHaveBeenCalledTimes(1);

    gate.resolve();
    handlers.onClose?.(1000, '');
    await expect(stream.done).resolves.toMatchObject({ reason: 'completed' });
  });

  it('rejects with a connection error reported by the WebSocket client', async () => {
    const connection = captureConnection();
    const stream = open({ onFrame: jest.fn() });
    const failure = new Error('WebSocket idle timeout: no message received for 1000ms');
    (await connection).handlers.onError?.(failure);

    await expect(stream.done).rejects.toBe(failure);
  });

  it('rejects when the connection cannot be opened', async () => {
    const failure = new Error('authentication failed');
    mockConnect.mockRejectedValue(failure);

    await expect(open({ onFrame: jest.fn() }).done).rejects.toBe(failure);
  });

  it.each([
    ['a negative beginExclusive', { beginExclusive: -1 }],
    ['a fractional beginExclusive', { beginExclusive: 1.5 }],
    ['an end before the begin', { beginExclusive: 10, endInclusive: 9 }],
    ['an update format that is not one', { updateFormat: { includeTransactions: 'all' } }],
  ])('throws a ValidationError for %s without connecting', (_name, params) => {
    expect(() => open({ onFrame: jest.fn(), ...(params as Partial<SubscribeToRawUpdatesParams>) })).toThrow(
      ValidationError
    );
    expect(mockConnect).not.toHaveBeenCalled();
  });
});
