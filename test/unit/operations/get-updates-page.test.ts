import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { LedgerJsonApiClient } from '../../../src/clients/ledger-json-api';
import { decodeRawUpdatesPage } from '../../../src/clients/ledger-json-api/operations/v2/updates/get-updates-page';
import { buildUpdateFormat } from '../../../src/clients/ledger-json-api/operations/v2/utils/event-format-builder';
import { ApiError, CantonRuntime, LossyJsonError, type ClientConfig } from '../../../src/core';

interface Recorded {
  readonly url: string | undefined;
  readonly authorization: string | undefined;
  readonly body: unknown;
}

async function startParticipant(
  reply: (body: unknown) => { status: number; text: string }
): Promise<{ url: string; requests: Recorded[]; close: () => Promise<void> }> {
  const requests: Recorded[] = [];
  const server = http.createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      const body: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      requests.push({ url: request.url, authorization: request.headers.authorization, body });
      const { status, text } = reply(body);
      response.writeHead(status, { 'Content-Type': 'application/json' });
      response.end(text);
    });
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: async () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => {
          resolve();
        });
      }),
  };
}

function ledgerClient(apiUrl: string): LedgerJsonApiClient {
  const config: ClientConfig = {
    network: 'localnet',
    apis: {
      LEDGER_JSON_API: {
        apiUrl,
        auth: { grantType: 'client_credentials', clientId: 'raw-reader', bearerToken: 'static-token' },
      },
    },
  };
  const client = new LedgerJsonApiClient(new CantonRuntime(config));
  return client;
}

const SYNC = 'global-domain::1220abcd';
const PAGE =
  `{"updates":[{"update":{"Transaction":{"value":{"updateId":"1220aa","offset":101,"synchronizerId":"${SYNC}",` +
  `"traceContext":null,"paidTrafficCost":0,"events":[]}}}},` +
  `{ "update" : { "Reassignment" : { "value" : { "updateId":"1220bb", "offset":105, "events":[] } } } },` +
  `{"update":{"TopologyTransaction":{"value":{"updateId":"1220cc","offset":107,"events":[]}}}}],` +
  `"lowestPageOffsetExclusive":100,"highestPageOffsetInclusive":110,"nextPageToken":"tok-2"}`;

describe('getUpdatesPage and getRawUpdatesPage', () => {
  const updateFormat = buildUpdateFormat({
    anyParty: true,
    includeCreatedEventBlob: true,
    includeTopologyEvents: true,
  });
  let participant: Awaited<ReturnType<typeof startParticipant>> | undefined;

  afterEach(async () => {
    await participant?.close();
    participant = undefined;
  });

  it('sends the any-party page request and returns the response text exactly', async () => {
    participant = await startParticipant(() => ({ status: 200, text: PAGE }));

    const page = await ledgerClient(participant.url).getRawUpdatesPage({
      updateFormat,
      beginOffsetExclusive: 100,
      endOffsetInclusive: 200,
      maxPageSize: 3,
      pageToken: 'tok-1',
    });

    expect(participant.requests).toEqual([
      {
        url: '/v2/updates/get-updates-page',
        authorization: 'Bearer static-token',
        body: { updateFormat, beginOffsetExclusive: 100, endOffsetInclusive: 200, maxPageSize: 3, pageToken: 'tok-1' },
      },
    ]);
    expect(page.text).toBe(PAGE);
    expect(page.json).toStrictEqual(JSON.parse(PAGE));
    expect(page.lowestPageOffsetExclusive).toBe(100);
    expect(page.highestPageOffsetInclusive).toBe(110);
    expect(page.nextPageToken).toBe('tok-2');
    expect(page.updates.map((u) => [u.kind, u.offset])).toEqual([
      ['Transaction', 101],
      ['Reassignment', 105],
      ['TopologyTransaction', 107],
    ]);
    expect(page.updates[0]?.json).toHaveProperty('update.Transaction.value.traceContext', null);
    // Each update carries its own slice of the response text, so it can be stored as the bytes received.
    expect(page.updates.map((u) => u.text)).toEqual([
      `{"update":{"Transaction":{"value":{"updateId":"1220aa","offset":101,"synchronizerId":"${SYNC}",` +
        `"traceContext":null,"paidTrafficCost":0,"events":[]}}}}`,
      `{ "update" : { "Reassignment" : { "value" : { "updateId":"1220bb", "offset":105, "events":[] } } } }`,
      `{"update":{"TopologyTransaction":{"value":{"updateId":"1220cc","offset":107,"events":[]}}}}`,
    ]);
    for (const update of page.updates) {
      expect(PAGE).toContain(update.text);
      expect(JSON.parse(update.text)).toStrictEqual(update.json);
    }
  });

  it('returns the typed page parsed as JSON without normalization', async () => {
    participant = await startParticipant(() => ({ status: 200, text: PAGE }));

    const page = await ledgerClient(participant.url).getUpdatesPage({ updateFormat, beginOffsetExclusive: 100 });

    expect(page).toStrictEqual(JSON.parse(PAGE));
    expect(participant.requests[0]?.body).toEqual({ updateFormat, beginOffsetExclusive: 100 });
  });

  it('keeps the Canton error code of an error response', async () => {
    participant = await startParticipant(() => ({
      status: 400,
      text: '{"code":"PARTICIPANT_PRUNED_DATA_ACCESSED","cause":"pruned up to 150","errorCategory":9}',
    }));

    const error = await ledgerClient(participant.url)
      .getRawUpdatesPage({ updateFormat, beginOffsetExclusive: 100 })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).message).toContain('PARTICIPANT_PRUNED_DATA_ACCESSED');
    expect((error as ApiError).context).toMatchObject({ code: 'PARTICIPANT_PRUNED_DATA_ACCESSED' });
  });

  it('fails loudly on a page JSON.parse would change', async () => {
    participant = await startParticipant(() => ({
      status: 200,
      text: PAGE.replace('"paidTrafficCost":0', '"paidTrafficCost":9007199254740993'),
    }));

    await expect(
      ledgerClient(participant.url).getRawUpdatesPage({ updateFormat, beginOffsetExclusive: 100 })
    ).rejects.toThrow(LossyJsonError);
  });
});

describe('decodeRawUpdatesPage', () => {
  it('reads an empty last page: no updates key, empty token', () => {
    const page = decodeRawUpdatesPage(
      '{"lowestPageOffsetExclusive":5,"highestPageOffsetInclusive":9,"nextPageToken":""}'
    );
    expect(page.updates).toEqual([]);
    expect(page.nextPageToken).toBeUndefined();
    expect(page.highestPageOffsetInclusive).toBe(9);
  });

  it('delivers an update kind it does not know, without an offset', () => {
    const page = decodeRawUpdatesPage(
      '{"updates":[{"update":{"FutureKind":{"value":{}}}}],"lowestPageOffsetExclusive":5,"highestPageOffsetInclusive":9}'
    );
    expect(page.updates).toEqual([
      {
        text: '{"update":{"FutureKind":{"value":{}}}}',
        kind: 'FutureKind',
        offset: undefined,
        json: { update: { FutureKind: { value: {} } } },
      },
    ]);
  });

  it("keeps each update's exact bytes where re-serializing its JSON would not", () => {
    // Integer-like keys come first in a JavaScript object, and JSON.stringify drops the whitespace.
    const item = '{"update":{"Transaction":{"value":{"offset":6,"m":{"10":1,"2":2},"s":"\\u00e9 é"}}}}';
    const text = `{"updates":[\n  ${item}\n],"lowestPageOffsetExclusive":5,"highestPageOffsetInclusive":9}`;

    const page = decodeRawUpdatesPage(text);

    expect(page.updates[0]?.text).toBe(item);
    expect(JSON.stringify(page.updates[0]?.json)).not.toBe(item);
  });

  it.each([
    ['text that is not JSON', '{"updates":'],
    ['a body that is not an object', '[]'],
    ['a missing bound', '{"lowestPageOffsetExclusive":5}'],
    ['reversed bounds', '{"lowestPageOffsetExclusive":9,"highestPageOffsetInclusive":5}'],
    ['updates that are not an array', '{"updates":{},"lowestPageOffsetExclusive":5,"highestPageOffsetInclusive":9}'],
    [
      'a token that is not a string',
      '{"nextPageToken":5,"lowestPageOffsetExclusive":5,"highestPageOffsetInclusive":9}',
    ],
    [
      'a known kind without an offset',
      '{"updates":[{"update":{"Transaction":{"value":{}}}}],"lowestPageOffsetExclusive":5,"highestPageOffsetInclusive":9}',
    ],
    [
      'an item with two kinds',
      '{"updates":[{"update":{"Transaction":{"value":{"offset":6}},"Reassignment":{"value":{"offset":7}}}}],' +
        '"lowestPageOffsetExclusive":5,"highestPageOffsetInclusive":9}',
    ],
  ])('rejects %s as a malformed page', (_name, text) => {
    expect(() => decodeRawUpdatesPage(text)).toThrow('Malformed get-updates-page response');
  });

  it('rejects a repeated key as lossy', () => {
    expect(() =>
      decodeRawUpdatesPage(
        '{"lowestPageOffsetExclusive":5,"highestPageOffsetInclusive":9,"highestPageOffsetInclusive":10}'
      )
    ).toThrow(LossyJsonError);
  });
});
