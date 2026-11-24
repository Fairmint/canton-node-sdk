import {
  discoverExternalParties,
  isExternalPartyError,
  MAX_EXTERNAL_PARTY_LOOKUP_HINTS,
  type ExternalPartyListAnswer,
  type ExternalPartyLookupAnswer,
} from '../../../src/external-parties';
import { createKey } from './support';

/** A party store: `existing` parties (hosted unless in `notHosted`), with jest mocks for the list and the lookup. */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- the jest mocks' inferred types
function store(options: { existing?: string[]; notHosted?: string[]; complete?: boolean } = {}) {
  const parties = new Set([...(options.existing ?? []), ...(options.notHosted ?? [])]);
  const notHosted = new Set(options.notHosted ?? []);
  const listParties = jest.fn(
    async (_request: { readonly signal?: AbortSignal }): Promise<ExternalPartyListAnswer> => ({
      parties: [...parties].map((partyId) => ({ partyId, hostedHere: !notHosted.has(partyId) })),
      complete: options.complete ?? true,
    })
  );
  const findParty = jest.fn(
    async (request: { readonly partyId: string; readonly signal?: AbortSignal }): Promise<ExternalPartyLookupAnswer> =>
      parties.has(request.partyId) ? { exists: true, hostedHere: !notHosted.has(request.partyId) } : { exists: false }
  );
  return { parties, listParties, findParty };
}

async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected a rejection');
}

describe('discoverExternalParties', () => {
  it("lists only the key's parties, sorted by hint, with hostedHere, and looks up nothing without hints", async () => {
    const key = createKey();
    const other = createKey();
    const { listParties, findParty } = store({
      existing: [`zed::${key.fingerprint}`, `privy-0123::${key.fingerprint}`, `alice::${other.fingerprint}`],
      notHosted: [`elsewhere::${key.fingerprint}`],
    });
    const found = await discoverExternalParties({ publicKeyFingerprint: key.fingerprint, listParties, findParty });
    expect(found).toEqual({
      parties: [
        { partyId: `elsewhere::${key.fingerprint}`, partyHint: 'elsewhere', hostedHere: false },
        { partyId: `privy-0123::${key.fingerprint}`, partyHint: 'privy-0123', hostedHere: true },
        { partyId: `zed::${key.fingerprint}`, partyHint: 'zed', hostedHere: true },
      ],
      complete: true,
      hintsChecked: true,
    });
    expect(findParty).not.toHaveBeenCalled();
    expect(Object.isFrozen(found)).toBe(true);
    expect(Object.isFrozen(found.parties)).toBe(true);
  });

  it('looks up the hints the list does not show, once each, when the list is incomplete', async () => {
    const key = createKey();
    const { listParties, findParty } = store({ existing: [`wallet::${key.fingerprint}`, `old::${key.fingerprint}`] });
    listParties.mockResolvedValueOnce({ parties: [], complete: false });
    const found = await discoverExternalParties({
      publicKeyFingerprint: key.fingerprint,
      hints: ['old', 'wallet', 'wallet-2', 'wallet'],
      listParties,
      findParty,
    });
    expect(found).toEqual({
      parties: [
        { partyId: `old::${key.fingerprint}`, partyHint: 'old', hostedHere: true },
        { partyId: `wallet::${key.fingerprint}`, partyHint: 'wallet', hostedHere: true },
      ],
      complete: false,
      hintsChecked: true,
    });
    expect(findParty).toHaveBeenCalledTimes(3);
  });

  it('answers exact lookups only without a list, and an unhosted lookup as not hosted', async () => {
    const key = createKey();
    const { findParty } = store({ existing: [`a::${key.fingerprint}`], notHosted: [`b::${key.fingerprint}`] });
    await expect(
      discoverExternalParties({ publicKeyFingerprint: key.fingerprint, hints: ['a', 'b', 'c'], findParty })
    ).resolves.toEqual({
      parties: [
        { partyId: `a::${key.fingerprint}`, partyHint: 'a', hostedHere: true },
        { partyId: `b::${key.fingerprint}`, partyHint: 'b', hostedHere: false },
      ],
      complete: false,
      hintsChecked: true,
    });
    // A lookup that leaves hostedHere out counts as hosted.
    findParty.mockResolvedValueOnce({ exists: true });
    await expect(
      discoverExternalParties({ publicKeyFingerprint: key.fingerprint, hints: ['c'], findParty })
    ).resolves.toMatchObject({ parties: [{ partyHint: 'c', hostedHere: true }] });
  });

  it('still looks up hints a complete (possibly cached) list does not show', async () => {
    const key = createKey();
    const { parties, listParties, findParty } = store();
    listParties.mockResolvedValueOnce({ parties: [], complete: true });
    parties.add(`wallet::${key.fingerprint}`);
    await expect(
      discoverExternalParties({ publicKeyFingerprint: key.fingerprint, hints: ['wallet'], listParties, findParty })
    ).resolves.toMatchObject({ parties: [{ partyId: `wallet::${key.fingerprint}` }], complete: true });
  });

  it('skips a failed lookup when the list is complete, and fails the call when it is not', async () => {
    const key = createKey();
    const { listParties, findParty } = store({ existing: [`nick::${key.fingerprint}`] });
    const down = new Error('lookup down');
    findParty.mockRejectedValue(down);
    await expect(
      discoverExternalParties({ publicKeyFingerprint: key.fingerprint, hints: ['wallet'], listParties, findParty })
    ).resolves.toMatchObject({ parties: [{ partyId: `nick::${key.fingerprint}` }], complete: true });

    listParties.mockResolvedValueOnce({ parties: [], complete: false });
    const error = await rejection(
      discoverExternalParties({ publicKeyFingerprint: key.fingerprint, hints: ['wallet'], listParties, findParty })
    );
    expect(isExternalPartyError(error, 'LOOKUP_FAILED')).toBe(true);
    expect((error as Error & { cause?: unknown }).cause).toBe(down);
    expect(error).toMatchObject({ partyId: `wallet::${key.fingerprint}` });
  });

  it("wraps a list failure, and refuses an unreadable answer even when a lookup's failure would be skipped", async () => {
    const key = createKey();
    const { listParties, findParty } = store();
    const unavailable = { status: 503 };
    listParties.mockRejectedValueOnce(unavailable);
    const listError = await rejection(discoverExternalParties({ publicKeyFingerprint: key.fingerprint, listParties }));
    expect(isExternalPartyError(listError, 'LIST_FAILED')).toBe(true);
    expect((listError as Error & { cause?: unknown }).cause).toBe(unavailable);

    listParties.mockResolvedValueOnce({ parties: [{ partyId: 'x::y' }], complete: true } as never);
    expect(
      isExternalPartyError(
        await rejection(discoverExternalParties({ publicKeyFingerprint: key.fingerprint, listParties })),
        'INVALID_RESPONSE'
      )
    ).toBe(true);

    findParty.mockResolvedValueOnce({ exists: 'yes' } as never);
    expect(
      isExternalPartyError(
        await rejection(
          discoverExternalParties({ publicKeyFingerprint: key.fingerprint, hints: ['a'], listParties, findParty })
        ),
        'INVALID_RESPONSE'
      )
    ).toBe(true);
  });

  it('marks hints it cannot check: an incomplete list without findParty is hintsChecked: false', async () => {
    const key = createKey();
    const { listParties } = store({ existing: [`wallet::${key.fingerprint}`], complete: false });
    await expect(
      discoverExternalParties({ publicKeyFingerprint: key.fingerprint, hints: ['wallet-2'], listParties })
    ).resolves.toEqual({
      parties: [{ partyId: `wallet::${key.fingerprint}`, partyHint: 'wallet', hostedHere: true }],
      complete: false,
      hintsChecked: false,
    });
    await expect(
      discoverExternalParties({ publicKeyFingerprint: key.fingerprint, listParties })
    ).resolves.toMatchObject({ complete: false, hintsChecked: true });
  });

  it("stops on the caller's signal, even when a callback ignores it, and never starts once aborted", async () => {
    const key = createKey();
    const { listParties, findParty } = store({ complete: false });
    listParties.mockImplementationOnce(async () => new Promise(() => undefined));
    const controller = new AbortController();
    const pending = discoverExternalParties({
      publicKeyFingerprint: key.fingerprint,
      signal: controller.signal,
      listParties,
      findParty,
    });
    expect(listParties.mock.calls[0]?.[0].signal).toBe(controller.signal);
    controller.abort();
    const listAbort = await rejection(pending);
    expect(isExternalPartyError(listAbort, 'ABORTED')).toBe(true);
    expect(listAbort).toMatchObject({ partyId: undefined });

    findParty.mockImplementationOnce(async () => new Promise(() => undefined));
    const lookups = new AbortController();
    const looking = discoverExternalParties({
      publicKeyFingerprint: key.fingerprint,
      hints: ['wallet', 'other'],
      signal: lookups.signal,
      listParties,
      findParty,
    });
    while (findParty.mock.calls.length === 0) await new Promise((resolve) => setImmediate(resolve));
    lookups.abort();
    const lookupAbort = await rejection(looking);
    expect(isExternalPartyError(lookupAbort, 'ABORTED')).toBe(true);
    expect(lookupAbort).toMatchObject({ partyId: `wallet::${key.fingerprint}` });
    expect(findParty).toHaveBeenCalledTimes(1);

    const aborted = new AbortController();
    aborted.abort();
    listParties.mockClear();
    findParty.mockClear();
    expect(
      isExternalPartyError(
        await rejection(
          discoverExternalParties({
            publicKeyFingerprint: key.fingerprint,
            hints: ['wallet'],
            signal: aborted.signal,
            listParties,
            findParty,
          })
        ),
        'ABORTED'
      )
    ).toBe(true);
    expect(listParties).not.toHaveBeenCalled();
    expect(findParty).not.toHaveBeenCalled();
  });

  it('refuses an invalid fingerprint or hints before calling anything', async () => {
    const key = createKey();
    const { listParties, findParty } = store();
    for (const input of [
      { publicKeyFingerprint: 'abc' },
      { publicKeyFingerprint: key.fingerprint, hints: ['a::b'] },
      { publicKeyFingerprint: key.fingerprint, hints: [' a'] },
      { publicKeyFingerprint: key.fingerprint, hints: [''] },
      {
        publicKeyFingerprint: key.fingerprint,
        hints: Array.from({ length: MAX_EXTERNAL_PARTY_LOOKUP_HINTS + 1 }, (_, i) => `h${i}`),
      },
    ]) {
      expect(
        isExternalPartyError(
          await rejection(discoverExternalParties({ ...input, listParties, findParty })),
          'INVALID_INPUT'
        )
      ).toBe(true);
    }
    expect(listParties).not.toHaveBeenCalled();
    expect(findParty).not.toHaveBeenCalled();
  });
});
