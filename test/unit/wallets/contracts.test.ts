import { parseBurnRequest, parseMintOffer, parseTransferOffer } from '../../../src/wallets/contracts';
import type { JsonObject } from '../../../src/wallets/json';
import type { ActiveContract } from '../../../src/wallets/types';

const PACKAGE = 'utility-registry-app-v0';
const REASON = 'splice.lfdecentralizedtrust.org/reason';
const OPERATOR = 'operator::1220aa';
const REGISTRAR = 'registrar::1220bb';
const HOLDER = 'holder::1220cc';

const contract = (entity: string, createArgument: JsonObject): ActiveContract => ({
  contractId: `00${entity}`,
  templateId: `pkgid:Utility.Registry.App.V0.Model.${entity}`,
  packageName: PACKAGE,
  signatories: [OPERATOR, REGISTRAR],
  createArgument,
});

const payload = (meta: JsonObject | undefined): JsonObject => ({
  instrumentId: { admin: REGISTRAR, id: 'XMPL' },
  amount: '100.0000000000',
  holder: HOLDER,
  reference: 'ref-1',
  requestedAt: '2026-11-13T00:00:00Z',
  executeBefore: '2026-11-16T00:00:00Z',
  ...(meta === undefined ? {} : { meta }),
});

const mintOffer = (meta: JsonObject | undefined): ActiveContract =>
  contract('Mint:MintOffer', { operator: OPERATOR, provider: REGISTRAR, mint: payload(meta) });

const burnRequest = (meta: JsonObject | undefined): ActiveContract =>
  contract('Burn:BurnRequest', {
    operator: OPERATOR,
    provider: REGISTRAR,
    burn: payload(meta),
    lockedHoldingCid: '00locked',
  });

describe('wallet contract readers: memo', () => {
  it("reads a mint offer's memo from its reason metadata", () => {
    const offer = parseMintOffer(mintOffer({ values: { [REASON]: 'Welcome to the fund' } }));
    expect(offer).toMatchObject({ contractId: '00Mint:MintOffer', reference: 'ref-1', memo: 'Welcome to the fund' });
  });

  it.each([
    ['empty metadata', { values: {} }],
    ['no meta', undefined],
    ['a non-text reason', { values: { [REASON]: 7 } }],
    ['malformed values', { values: 'nope' }],
  ])('gives a null mint memo for %s', (_label, meta) => {
    expect(parseMintOffer(mintOffer(meta as JsonObject | undefined))?.memo).toBeNull();
  });

  it('keeps an empty mint memo as the empty string', () => {
    expect(parseMintOffer(mintOffer({ values: { [REASON]: '' } }))?.memo).toBe('');
  });

  it("reads a burn request's memo from its reason metadata", () => {
    expect(parseBurnRequest(burnRequest({ values: { [REASON]: 'Redemption' } }))).toMatchObject({
      lockedHoldingCid: '00locked',
      memo: 'Redemption',
    });
    expect(parseBurnRequest(burnRequest({ values: {} }))?.memo).toBeNull();
  });

  it('reads a transfer offer memo the same way', () => {
    const offer = parseTransferOffer(
      contract('Transfer:TransferOffer', {
        operator: OPERATOR,
        provider: REGISTRAR,
        transfer: {
          sender: REGISTRAR,
          receiver: HOLDER,
          amount: '1.0000000000',
          instrumentId: { admin: REGISTRAR, id: 'XMPL' },
          requestedAt: '2026-11-13T00:00:00Z',
          executeBefore: '2026-11-14T00:00:00Z',
          inputHoldingCids: [],
          meta: { values: { [REASON]: 'hello' } },
        },
      })
    );
    expect(offer?.memo).toBe('hello');
  });
});
