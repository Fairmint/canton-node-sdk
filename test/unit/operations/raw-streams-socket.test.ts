import type { AddressInfo } from 'node:net';
import { WebSocketServer, type WebSocket } from 'ws';
import { SubscribeToRawCompletions } from '../../../src/clients/ledger-json-api/operations/v2/commands/subscribe-to-raw-completions';
import {
  SubscribeToRawUpdates,
  type RawUpdateFrame,
} from '../../../src/clients/ledger-json-api/operations/v2/updates/subscribe-to-raw-updates';
import { buildUpdateFormat } from '../../../src/clients/ledger-json-api/operations/v2/utils/event-format-builder';
import { RawStreamError } from '../../../src/clients/ledger-json-api/operations/v2/utils/raw-frame-stream';

/**
 * These tests run the raw streams through the real `WebSocketClient` and `ws` against a local server that plays the
 * participant, so the frames a consumer receives are compared with the bytes a server wrote.
 */

interface Participant {
  readonly url: string;
  /** Request messages received, in order. */
  readonly requests: unknown[];
  readonly authorizations: Array<string | undefined>;
  readonly close: () => Promise<void>;
}

async function startParticipant(script: (socket: WebSocket) => void): Promise<Participant> {
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await new Promise<void>((resolve) => {
    server.once('listening', resolve);
  });
  const requests: unknown[] = [];
  const authorizations: Array<string | undefined> = [];
  server.on('connection', (socket, request) => {
    authorizations.push(request.headers.authorization);
    socket.once('message', (data: Buffer) => {
      requests.push(JSON.parse(data.toString('utf8')));
      script(socket);
    });
  });
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    authorizations,
    close: async () =>
      new Promise<void>((resolve) => {
        for (const client of server.clients) client.terminate();
        server.close(() => {
          resolve();
        });
      }),
  };
}

function ledgerClient(
  url: string,
  token: { issuedAt: number | null; expiresAt: number | null } = { issuedAt: null, expiresAt: null }
): { clearToken: jest.Mock } & Record<string, unknown> {
  return {
    getApiUrl: () => url,
    authenticate: jest.fn().mockResolvedValue('test-token'),
    getTokenIssuedAt: () => token.issuedAt,
    getTokenExpiryTime: () => token.expiresAt,
    getLogger: () => undefined,
    clearToken: jest.fn(),
  };
}

const SYNC = 'global-domain::1220abcd';

// Frames written as a participant could write them, including spacing the SDK must keep and nulls it must not drop.
const FRAMES = [
  `{"update":{"Transaction":{"value":{"updateId":"1220aa","commandId":"cmd-1","workflowId":"","offset":7579338,` +
    `"synchronizerId":"${SYNC}","effectiveAt":"2026-11-02T10:00:00.123456Z","recordTime":"2026-11-02T10:00:00.234567Z",` +
    `"traceContext":{"traceparent":"00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01","tracestate":null},` +
    `"externalTransactionHash":null,"paidTrafficCost":12345,"events":[{"CreatedEvent":{"offset":7579338,"nodeId":0,` +
    `"contractId":"00ab","templateId":"pkg:Mod:T","contractKey":null,"createArgument":{"owner":"Alice::1","n":"1.50"},` +
    `"createdEventBlob":"CgM=","interfaceViews":[],"witnessParties":["Alice::1","Bob::1"],"signatories":["Alice::1"],` +
    `"observers":["Bob::1"],"createdAt":"2026-11-02T10:00:00.123456Z","packageName":"p","acsDelta":true,` +
    `"representativePackageId":"pkg"}}]}}}}`,
  `{ "update" : { "Reassignment" : { "value" : { "updateId" : "1220bb", "offset" : 7579340, "events" : [ ] } } } }`,
  `{"update":{"TopologyTransaction":{"value":{"updateId":"1220cc","offset":7579341,"synchronizerId":"${SYNC}",` +
    `"recordTime":"2026-11-02T10:00:01Z","events":[{"event":{"ParticipantAuthorizationOnboarding":{"value":` +
    `{"partyId":"Carol::1","participantId":"PAR::1","participantPermission":"PARTICIPANT_PERMISSION_OBSERVATION"}}}}]}}}}`,
  `{"update":{"OffsetCheckpoint":{"value":{"offset":7579341,"synchronizerTimes":[{"synchronizerId":"${SYNC}",` +
    `"recordTime":"2026-11-02T10:00:01Z"}]}}}}`,
];

describe('raw streams over a real WebSocket', () => {
  let participant: Participant | undefined;

  afterEach(async () => {
    await participant?.close();
    participant = undefined;
  });

  it('reads as every party and delivers each frame byte for byte, then completes', async () => {
    participant = await startParticipant((socket) => {
      for (const frame of FRAMES) socket.send(frame);
      socket.close(1000);
    });
    const frames: RawUpdateFrame[] = [];
    const updateFormat = buildUpdateFormat({
      anyParty: true,
      includeCreatedEventBlob: true,
      includeTopologyEvents: true,
      verbose: true,
    });

    const stream = new SubscribeToRawUpdates(ledgerClient(participant.url) as never).connect({
      updateFormat,
      beginExclusive: 7579337,
      endInclusive: 7579400,
      onFrame: (frame) => void frames.push(frame),
    });

    await expect(stream.done).resolves.toEqual({ reason: 'completed', lastOffset: 7579341, closeCode: 1000 });
    expect(participant.authorizations).toEqual(['Bearer test-token']);
    expect(participant.requests).toEqual([{ beginExclusive: 7579337, endInclusive: 7579400, updateFormat }]);
    const [request] = participant.requests as Array<{ updateFormat: Record<string, unknown> }>;
    expect(JSON.stringify(request)).not.toContain('"parties"');
    expect(request?.updateFormat).toMatchObject({
      includeTransactions: { eventFormat: { filtersByParty: {}, filtersForAnyParty: expect.any(Object) } },
      includeReassignments: { filtersByParty: {}, filtersForAnyParty: expect.any(Object) },
      includeTopologyEvents: { includeParticipantAuthorizationEvents: {} },
    });
    expect(frames.map((frame) => frame.text)).toEqual(FRAMES);
    expect(frames.map((frame) => [frame.kind, frame.offset])).toEqual([
      ['Transaction', 7579338],
      ['Reassignment', 7579340],
      ['TopologyTransaction', 7579341],
      ['OffsetCheckpoint', 7579341],
    ]);
    frames.forEach((frame, index) => {
      expect(frame.json).toStrictEqual(JSON.parse(FRAMES[index] ?? ''));
    });
  });

  it('ends with token-refresh before the token expires and clears the token', async () => {
    participant = await startParticipant((socket) => {
      socket.send(FRAMES[0] ?? '');
      // Keeps the stream open, as a tailing participant does.
    });
    const now = Date.now();
    // A 12-minute token that expires in 2 minutes and 300 ms: the refresh is due 300 ms from now.
    const client = ledgerClient(participant.url, { issuedAt: now - 10 * 60_000, expiresAt: now + 2 * 60_000 + 300 });
    const onTokenExpiring = jest.fn();

    const stream = new SubscribeToRawUpdates(client as never).connect({
      updateFormat: buildUpdateFormat({ anyParty: true }),
      beginExclusive: 7579337,
      onFrame: jest.fn(),
      onTokenExpiring,
    });

    await expect(stream.done).resolves.toEqual({ reason: 'token-refresh', lastOffset: 7579338, closeCode: 4000 });
    expect(client.clearToken).toHaveBeenCalledTimes(1);
    expect(onTokenExpiring).toHaveBeenCalledTimes(1);
  });

  it('fails with the error the refresh hook threw, still clearing the token', async () => {
    participant = await startParticipant((socket) => {
      socket.send(FRAMES[0] ?? '');
    });
    const now = Date.now();
    const client = ledgerClient(participant.url, { issuedAt: now - 10 * 60_000, expiresAt: now + 2 * 60_000 + 300 });
    const failure = new Error('could not save the cursor');

    const stream = new SubscribeToRawUpdates(client as never).connect({
      updateFormat: buildUpdateFormat({ anyParty: true }),
      beginExclusive: 7579337,
      onFrame: jest.fn(),
      onTokenRefreshNeeded: async () => Promise.reject(failure),
    });

    await expect(stream.done).rejects.toBe(failure);
    expect(stream.lastOffset).toBe(7579338);
    expect(client.clearToken).toHaveBeenCalledTimes(1);
  });

  it('fails loudly on a frame JSON.parse would change, and closes the socket', async () => {
    let closedByClient: Promise<number> | undefined;
    participant = await startParticipant((socket) => {
      closedByClient = new Promise<number>((resolve) => {
        socket.once('close', (code: number) => {
          resolve(code);
        });
      });
      socket.send(FRAMES[0]?.replace('"paidTrafficCost":12345', '"paidTrafficCost":18446744073709551615') ?? '');
    });

    const stream = new SubscribeToRawUpdates(ledgerClient(participant.url) as never).connect({
      updateFormat: buildUpdateFormat({ anyParty: true }),
      beginExclusive: 7579337,
      onFrame: jest.fn(),
    });

    const error = await stream.done.catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RawStreamError);
    expect((error as RawStreamError).reason).toBe('lossy-json');
    expect(stream.lastOffset).toBe(7579337);
    await expect(closedByClient).resolves.toEqual(expect.any(Number));
  });

  it("reads one user's completions for the listed parties, frame for frame", async () => {
    const completion =
      `{"completionResponse":{"Completion":{"value":{"commandId":"cmd-1","status":{"code":0,"message":"",` +
      `"details":[]},"updateId":"1220aa","userId":"ta-service","actAs":["Alice::1","Bob::1"],"submissionId":"s-1",` +
      `"deduplicationPeriod":{"Empty":{}},"traceContext":null,"offset":7579338,` +
      `"synchronizerTime":{"synchronizerId":"${SYNC}","recordTime":"2026-11-02T10:00:00Z"},"paidTrafficCost":12345}}}}`;
    const checkpoint = `{"completionResponse":{"OffsetCheckpoint":{"value":{"offset":7579350,"synchronizerTimes":[]}}}}`;
    participant = await startParticipant((socket) => {
      socket.send(completion);
      socket.send(checkpoint);
      socket.close(1000);
    });
    const texts: string[] = [];

    const stream = new SubscribeToRawCompletions(ledgerClient(participant.url) as never).connect({
      userId: 'ta-service',
      parties: ['Alice::1', 'Bob::1'],
      beginExclusive: 7579337,
      onFrame: (frame) => void texts.push(frame.text),
    });

    await expect(stream.done).resolves.toEqual({ reason: 'completed', lastOffset: 7579350, closeCode: 1000 });
    expect(participant.requests).toEqual([
      { userId: 'ta-service', parties: ['Alice::1', 'Bob::1'], beginExclusive: 7579337 },
    ]);
    expect(texts).toEqual([completion, checkpoint]);
  });
});
