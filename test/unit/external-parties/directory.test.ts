import { ApiError } from '../../../src/core/errors';
import type { LedgerJsonApiClient } from '../../../src/clients/ledger-json-api';
import { isCantonProtocolError } from '@fairmint/canton-protocol/party';
import { createExternalPartyDirectory, type ExternalPartyDirectoryLedgerClient } from '../../../src/external-parties';
import * as Root from '../../../src';
import * as ExternalPartiesEntry from '../../../src/external-parties';
import { createKey } from './support';

const API = 'https://participant.example';

function pagedClient(pages: ReadonlyArray<Record<string, unknown>>): {
  client: ExternalPartyDirectoryLedgerClient;
  gets: string[];
} {
  const gets: string[] = [];
  let index = 0;
  const client: ExternalPartyDirectoryLedgerClient = {
    getApiUrl: () => API,
    makeGetRequest: async <T>(url: string) => {
      gets.push(url);
      const page = pages[Math.min(index, pages.length - 1)];
      index += 1;
      return page as T;
    },
  };
  return { client, gets };
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected a rejection');
}

describe('createExternalPartyDirectory', () => {
  it("takes node-sdk's LedgerJsonApiClient by its shape", () => {
    const accepts = (client: LedgerJsonApiClient): ExternalPartyDirectoryLedgerClient => client;
    expect(typeof accepts).toBe('function');
    expect(() => createExternalPartyDirectory({ ledgerClient: {} as never })).toThrow(/LedgerJsonApiClient/);
  });

  it("pages GET /v2/parties and keeps the key's parties only", async () => {
    const key = createKey();
    const other = createKey();
    const { client, gets } = pagedClient([
      {
        partyDetails: [
          { party: `a::${key.fingerprint}`, isLocal: true },
          { party: `b::${other.fingerprint}`, isLocal: true },
          { party: `x::y::${key.fingerprint}`, isLocal: true },
        ],
        nextPageToken: 'p2',
      },
      { partyDetails: [{ party: `c::${key.fingerprint}`, isLocal: false }], nextPageToken: '' },
    ]);
    const directory = createExternalPartyDirectory({ ledgerClient: client, identityProviderId: 'idp', pageSize: 2 });
    await expect(directory.listPartiesForKey({ publicKeyBase64: key.publicKeyBase64 })).resolves.toEqual({
      parties: [
        { partyId: `a::${key.fingerprint}`, partyHint: 'a', hostedHere: true },
        { partyId: `c::${key.fingerprint}`, partyHint: 'c', hostedHere: false },
      ],
      complete: true,
    });
    await expect(directory.listPartiesForKey({ publicKeyFingerprint: other.fingerprint })).resolves.toEqual({
      parties: [{ partyId: `b::${other.fingerprint}`, partyHint: 'b', hostedHere: true }],
      complete: true,
    });
    expect(gets).toEqual([
      `${API}/v2/parties?pageSize=2&identity-provider-id=idp`,
      `${API}/v2/parties?pageSize=2&pageToken=p2&identity-provider-id=idp`,
    ]);
  });

  it('stops at maxPages or timeoutMs and answers complete: false', async () => {
    const key = createKey();
    let token = 0;
    const endless: ExternalPartyDirectoryLedgerClient = {
      getApiUrl: () => API,
      makeGetRequest: async <T>() => {
        token += 1;
        return {
          partyDetails: [{ party: `p${token}::${key.fingerprint}`, isLocal: true }],
          nextPageToken: `t${token}`,
        } as T;
      },
    };
    const byPages = await createExternalPartyDirectory({ ledgerClient: endless, maxPages: 3 }).listPartiesForKey({
      publicKeyFingerprint: key.fingerprint,
    });
    expect(byPages.complete).toBe(false);
    expect(byPages.parties).toHaveLength(3);

    let clock = 0;
    const byTime = createExternalPartyDirectory({
      ledgerClient: {
        ...endless,
        makeGetRequest: async <T>(url: string) => {
          clock += 600;
          return endless.makeGetRequest<T>(url, {});
        },
      },
      timeoutMs: 1_000,
      now: () => clock,
    });
    const timed = await byTime.listPartiesForKey({ publicKeyFingerprint: key.fingerprint });
    expect(timed.complete).toBe(false);
    expect(timed.parties).toHaveLength(2);
  });

  it('skips a stored party a listing could not answer, instead of failing every key', async () => {
    const key = createKey();
    const { client } = pagedClient([
      {
        partyDetails: [
          { party: `${'a'.repeat(186)}::${key.fingerprint}`, isLocal: true },
          { party: ` padded::${key.fingerprint}`, isLocal: true },
          { party: `ok::${key.fingerprint}`, isLocal: true },
        ],
      },
    ]);
    await expect(
      createExternalPartyDirectory({ ledgerClient: client }).listPartiesForKey({
        publicKeyFingerprint: key.fingerprint,
      })
    ).resolves.toEqual({
      parties: [{ partyId: `ok::${key.fingerprint}`, partyHint: 'ok', hostedHere: true }],
      complete: true,
    });
  });

  it('stops paging when the participant repeats a page token', async () => {
    const key = createKey();
    const { client, gets } = pagedClient([{ partyDetails: [], nextPageToken: 'same' }]);
    await expect(
      createExternalPartyDirectory({ ledgerClient: client }).listPartiesForKey({
        publicKeyFingerprint: key.fingerprint,
      })
    ).resolves.toEqual({ parties: [], complete: false });
    expect(gets).toHaveLength(2);
  });

  it("bounds a stalled page by timeoutMs and stops a caller's wait on abort", async () => {
    const key = createKey();
    const signals: Array<AbortSignal | undefined> = [];
    const stalled: ExternalPartyDirectoryLedgerClient = {
      getApiUrl: () => API,
      makeGetRequest: async <T>(_url: string, _config?: unknown, options?: { readonly signal?: AbortSignal }) => {
        signals.push(options?.signal);
        return new Promise<T>(() => undefined);
      },
    };
    const directory = createExternalPartyDirectory({ ledgerClient: stalled, timeoutMs: 100, cacheMs: 0 });
    const started = Date.now();
    await expect(directory.listPartiesForKey({ publicKeyFingerprint: key.fingerprint })).resolves.toEqual({
      parties: [],
      complete: false,
    });
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(signals[0]?.aborted).toBe(true);

    const slow = createExternalPartyDirectory({ ledgerClient: stalled, timeoutMs: 1_000 });
    const controller = new AbortController();
    const waiting = slow.listPartiesForKey({ publicKeyFingerprint: key.fingerprint, signal: controller.signal });
    controller.abort();
    expect(isCantonProtocolError(await rejection(waiting), 'ABORTED')).toBe(true);
    // The abort stopped the caller's wait, not the shared scan: it still ends at its own deadline.
    await expect(slow.listPartiesForKey({ publicKeyFingerprint: key.fingerprint })).resolves.toEqual({
      parties: [],
      complete: false,
    });
    expect(signals).toHaveLength(2);
  });

  it('serves every key from one cached scan, shares a scan in flight, and adds parties noted as allocated', async () => {
    const key = createKey();
    const other = createKey();
    const { client, gets } = pagedClient([
      {
        partyDetails: [
          { party: `a::${key.fingerprint}`, isLocal: true },
          { party: `b::${other.fingerprint}`, isLocal: true },
        ],
      },
    ]);
    let clock = 1_000;
    const directory = createExternalPartyDirectory({ ledgerClient: client, now: () => clock });
    const [mine, theirs] = await Promise.all([
      directory.listPartiesForKey({ publicKeyFingerprint: key.fingerprint }),
      directory.listPartiesForKey({ publicKeyFingerprint: other.fingerprint }),
    ]);
    expect(mine.parties).toEqual([{ partyId: `a::${key.fingerprint}`, partyHint: 'a', hostedHere: true }]);
    expect(theirs.parties).toEqual([{ partyId: `b::${other.fingerprint}`, partyHint: 'b', hostedHere: true }]);
    expect(gets).toHaveLength(1);
    directory.noteAllocated(`new::${key.fingerprint}`);
    clock += 1_000;
    await expect(directory.listPartiesForKey({ publicKeyFingerprint: key.fingerprint })).resolves.toEqual({
      parties: [
        { partyId: `a::${key.fingerprint}`, partyHint: 'a', hostedHere: true },
        { partyId: `new::${key.fingerprint}`, partyHint: 'new', hostedHere: true },
      ],
      complete: true,
    });
    expect(gets).toHaveLength(1);
    clock += 30_000;
    await directory.listPartiesForKey({ publicKeyFingerprint: key.fingerprint });
    expect(gets).toHaveLength(2);
  });

  it("lists a party noted as allocated even when a later scan's pages do not hold it yet", async () => {
    const key = createKey();
    let clock = 0;
    const { client } = pagedClient([{ partyDetails: [], nextPageToken: '' }]);
    const directory = createExternalPartyDirectory({
      ledgerClient: client,
      cacheMs: 1_000,
      timeoutMs: 1_000,
      now: () => clock,
    });
    directory.noteAllocated(`fresh::${key.fingerprint}`);
    clock = 1_500;
    await expect(directory.listPartiesForKey({ publicKeyFingerprint: key.fingerprint })).resolves.toMatchObject({
      parties: [{ partyId: `fresh::${key.fingerprint}`, hostedHere: true }],
    });
    // Past one cache window and one scan timeout, the scan answers alone.
    clock = 2_001;
    await expect(directory.listPartiesForKey({ publicKeyFingerprint: key.fingerprint })).resolves.toMatchObject({
      parties: [],
    });
  });

  it('drops expired allocations when it records one, without listing', () => {
    const key = createKey();
    let clock = 0;
    const { client } = pagedClient([{ partyDetails: [] }]);
    const directory = createExternalPartyDirectory({
      ledgerClient: client,
      cacheMs: 1_000,
      timeoutMs: 1_000,
      now: () => clock,
    });
    const deleted = jest.spyOn(Map.prototype, 'delete');
    try {
      directory.noteAllocated(`p1::${key.fingerprint}`);
      clock += 2_001;
      directory.noteAllocated(`p2::${key.fingerprint}`);
      expect(deleted).toHaveBeenCalledWith(`p1::${key.fingerprint}`);
      expect(deleted).not.toHaveBeenCalledWith(`p2::${key.fingerprint}`);
    } finally {
      deleted.mockRestore();
    }
    expect(() => directory.noteAllocated('no-namespace')).toThrow(/hint::namespace/);
    // An ID a listing would refuse is refused here, so it can never fail the key's listings.
    for (const partyId of [
      `${'a'.repeat(186)}::${key.fingerprint}`,
      ` p3::${key.fingerprint}`,
      `p\n3::${key.fingerprint}`,
      // Outside the Daml-LF Party character set.
      `p.3::${key.fingerprint}`,
    ]) {
      expect(() => directory.noteAllocated(partyId)).toThrow(/Daml-LF party ID .*255 ASCII letters, digits, spaces/);
    }
  });

  it('finds one party: 404 or unlisted is not found, else hostedHere is isLocal', async () => {
    const key = createKey();
    const gets: string[] = [];
    const answers = new Map<string, unknown>([
      [`here::${key.fingerprint}`, { partyDetails: [{ party: `here::${key.fingerprint}`, isLocal: true }] }],
      [`there::${key.fingerprint}`, { partyDetails: [{ party: `there::${key.fingerprint}`, isLocal: false }] }],
      [`other::${key.fingerprint}`, { partyDetails: [{ party: 'someone::else', isLocal: true }] }],
      [`bad::${key.fingerprint}`, { partyDetails: 'nope' }],
    ]);
    const client: ExternalPartyDirectoryLedgerClient = {
      getApiUrl: () => API,
      makeGetRequest: async <T>(url: string) => {
        gets.push(url);
        const partyId = decodeURIComponent(url.slice(`${API}/v2/parties/`.length).split('?')[0] ?? '');
        if (partyId === `down::${key.fingerprint}`) throw new ApiError('unavailable', 503);
        if (!answers.has(partyId)) throw new ApiError('not found', 404);
        return answers.get(partyId) as T;
      },
    };
    const directory = createExternalPartyDirectory({ ledgerClient: client, identityProviderId: 'idp' });
    await expect(directory.findParty({ partyId: `here::${key.fingerprint}` })).resolves.toEqual({
      exists: true,
      hostedHere: true,
    });
    await expect(directory.findParty({ partyId: `there::${key.fingerprint}` })).resolves.toEqual({
      exists: true,
      hostedHere: false,
    });
    await expect(directory.findParty({ partyId: `other::${key.fingerprint}` })).resolves.toEqual({ exists: false });
    await expect(directory.findParty({ partyId: `gone::${key.fingerprint}` })).resolves.toEqual({ exists: false });
    expect(
      isCantonProtocolError(
        await rejection(directory.findParty({ partyId: `bad::${key.fingerprint}` })),
        'INVALID_RESPONSE'
      )
    ).toBe(true);
    await expect(directory.findParty({ partyId: `down::${key.fingerprint}` })).rejects.toBeInstanceOf(ApiError);
    expect(gets[0]).toBe(
      `${API}/v2/parties/${encodeURIComponent(`here::${key.fingerprint}`)}?identity-provider-id=idp`
    );
  });

  it('looks up the hints an incomplete scan does not show, and fails the listing when a lookup fails', async () => {
    const key = createKey();
    const gets: string[] = [];
    const client: ExternalPartyDirectoryLedgerClient = {
      getApiUrl: () => API,
      makeGetRequest: async <T>(url: string) => {
        gets.push(url);
        if (url.includes('/v2/parties?')) {
          return { partyDetails: [{ party: `a::${key.fingerprint}`, isLocal: true }], nextPageToken: 'more' } as T;
        }
        if (url.includes(encodeURIComponent(`wallet::${key.fingerprint}`))) {
          return { partyDetails: [{ party: `wallet::${key.fingerprint}`, isLocal: true }] } as T;
        }
        if (url.includes(encodeURIComponent(`down::${key.fingerprint}`))) throw new ApiError('unavailable', 503);
        throw new ApiError('not found', 404);
      },
    };
    const directory = createExternalPartyDirectory({ ledgerClient: client, maxPages: 1 });
    await expect(
      directory.listPartiesForKey({ publicKeyBase64: key.publicKeyBase64, hints: ['a', 'wallet', 'wallet-2'] })
    ).resolves.toEqual({
      parties: [
        { partyId: `a::${key.fingerprint}`, partyHint: 'a', hostedHere: true },
        { partyId: `wallet::${key.fingerprint}`, partyHint: 'wallet', hostedHere: true },
      ],
      complete: false,
    });
    // One scan page, and lookups of the two hints it did not show.
    expect(gets).toHaveLength(3);
    const error = await rejection(
      directory.listPartiesForKey({ publicKeyFingerprint: key.fingerprint, hints: ['down'] })
    );
    expect(isCantonProtocolError(error, 'LOOKUP_FAILED')).toBe(true);
    expect((error as Error & { cause?: unknown }).cause).toBeInstanceOf(ApiError);
  });

  it('wraps a failed scan as LIST_FAILED and refuses an invalid answer, key or bounds', async () => {
    const key = createKey();
    const failure = new ApiError('unavailable', 503);
    const failing = createExternalPartyDirectory({
      ledgerClient: { getApiUrl: () => API, makeGetRequest: async () => Promise.reject(failure) },
    });
    const listError = await rejection(failing.listPartiesForKey({ publicKeyFingerprint: key.fingerprint }));
    expect(isCantonProtocolError(listError, 'LIST_FAILED')).toBe(true);
    expect((listError as Error & { cause?: unknown }).cause).toBe(failure);

    const { client } = pagedClient([{ partyDetails: 'nope' }]);
    const invalid = await rejection(
      createExternalPartyDirectory({ ledgerClient: client }).listPartiesForKey({
        publicKeyFingerprint: key.fingerprint,
      })
    );
    expect(isCantonProtocolError(invalid, 'INVALID_RESPONSE')).toBe(true);
    expect((invalid as Error).message).toBe('The participant returned an invalid party list.');

    const directory = createExternalPartyDirectory({ ledgerClient: client });
    for (const request of [
      { publicKeyFingerprint: 'nope' },
      { publicKeyBase64: 'nope' },
      { publicKeyBase64: key.publicKeyBase64, publicKeyFingerprint: createKey().fingerprint },
    ]) {
      expect(
        isCantonProtocolError(await rejection(directory.listPartiesForKey(request as never)), 'INVALID_INPUT')
      ).toBe(true);
    }
    expect(() => createExternalPartyDirectory({ ledgerClient: client, pageSize: 0 })).toThrow(/pageSize/);
    expect(() => createExternalPartyDirectory({ ledgerClient: client, maxPages: 1.5 })).toThrow(/maxPages/);
    expect(() => createExternalPartyDirectory({ ledgerClient: client, timeoutMs: 10 })).toThrow(/timeoutMs/);
    expect(() => createExternalPartyDirectory({ ledgerClient: client, cacheMs: -1 })).toThrow(/cacheMs/);
  });
});

describe('the ./external-parties entry point', () => {
  it('exports only the directory, also as the root ExternalParties namespace; identity and discovery are canton-protocol', () => {
    expect(Object.keys(ExternalPartiesEntry).sort()).toEqual(['createExternalPartyDirectory']);
    expect(Root.ExternalParties.createExternalPartyDirectory).toBe(createExternalPartyDirectory);
    expect(Object.keys(Root.ExternalParties).sort()).toEqual(['createExternalPartyDirectory']);
    // The moved helpers are not re-exported from the root either (no backward compatibility).
    for (const moved of [
      'deriveCantonEd25519PublicKeyFingerprint',
      'buildExternalPartyId',
      'normalizeEd25519PublicKeyForCanton',
      'extractRawEd25519PublicKey',
      'extractPublicKeyFingerprint',
      'assertCantonPartyMatchesPublicKey',
      'normalizeCantonHashToHex',
      'assertCantonSha256MultihashHex',
      'assertCantonHashSignature',
      'hashPreparedTransaction',
      'preparedTransactionHashToHex',
      'prepareExternalPartyCcTransfer',
      'submitExternalPartyCcTransfer',
    ]) {
      expect(moved in Root).toBe(false);
    }
  });
});
