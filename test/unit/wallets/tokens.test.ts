import type { TransferOffer, TransferPreapproval } from '../../../src/wallets/contracts';
import { coveringPreapproval } from '../../../src/wallets/contracts';
import type { Holding, InstrumentBalance } from '../../../src/wallets/holdings';
import type { InstrumentId } from '../../../src/wallets/types';
import * as Wallets from '../../../src/wallets';
import {
  expiredUnclaimedLocks,
  isTransferOfferExpired,
  lockedInExpiredOffers,
  walletTokens,
} from '../../../src/wallets/tokens';
import { DSO, HOLDER, INSTRUMENT, OPERATOR, OTHER, REGISTRAR } from './helpers';

const CC = { admin: DSO, id: 'Amulet' } as const;
const CC_KEY = `Amulet@${DSO}`;
const XMPL_KEY = 'XMPL@registrar::1220bb';

const offer = (overrides: Partial<TransferOffer> & Pick<TransferOffer, 'contractId'>): TransferOffer => ({
  registry: 'da',
  operator: OPERATOR,
  provider: REGISTRAR,
  sender: HOLDER,
  receiver: OTHER,
  instrumentId: INSTRUMENT,
  amount: '5.0000000000',
  memo: null,
  requestedAt: '2026-11-12T00:00:00Z',
  executeBefore: '2026-11-13T00:00:00Z',
  ...overrides,
});

const holding = (
  contractId: string,
  amount: string,
  locked: boolean,
  instrumentId: InstrumentId = INSTRUMENT
): Holding => ({
  contractId,
  owner: HOLDER,
  instrumentId,
  amount,
  locked,
  source: instrumentId === INSTRUMENT ? 'da-registry' : 'amulet',
});

describe('isTransferOfferExpired', () => {
  const at = Date.parse('2026-11-13T00:00:00Z');
  it('is expired from executeBefore on; an unreadable deadline never is', () => {
    expect(isTransferOfferExpired({ executeBefore: '2026-11-13T00:00:00Z' }, at)).toBe(true);
    expect(isTransferOfferExpired({ executeBefore: '2026-11-12T23:59:59.999999Z' }, at)).toBe(true);
    expect(isTransferOfferExpired({ executeBefore: '2026-11-13T00:00:00.000001Z' }, at + 1)).toBe(true);
    expect(isTransferOfferExpired({ executeBefore: '2026-11-13T00:00:01Z' }, at)).toBe(false);
    expect(isTransferOfferExpired({ executeBefore: 'soon' }, at)).toBe(false);
  });
});

describe('lockedInExpiredOffers', () => {
  it('counts a DA offer by its amount and a CC offer by its locked holding, capped at the locked total', () => {
    const holdings = [
      holding('00l1', '5', true),
      holding('00u', '100', false),
      holding('00cclock', '4.2', true, CC),
      holding('00cclock2', '1', true, CC),
    ];
    const totals = lockedInExpiredOffers(holdings, [
      offer({ contractId: '00a' }),
      offer({ contractId: '00b' }), // 10 offered, but only 5 is locked
      offer({ contractId: '00cc', registry: 'amulet', instrumentId: CC, amount: '4', lockedHoldingCid: '00cclock' }),
      // The same LockedAmulet named twice counts once; a released lock counts nothing.
      offer({ contractId: '00cc2', registry: 'amulet', instrumentId: CC, amount: '4', lockedHoldingCid: '00cclock' }),
      offer({ contractId: '00cc3', registry: 'amulet', instrumentId: CC, amount: '9', lockedHoldingCid: '00gone' }),
    ]);
    expect(Object.fromEntries(totals)).toEqual({ [XMPL_KEY]: 50000000000n, [CC_KEY]: 42000000000n });
  });

  it('ignores an unlocked holding named as the lock', () => {
    const totals = lockedInExpiredOffers(
      [holding('00free', '3', false, CC)],
      [offer({ contractId: '00cc', registry: 'amulet', instrumentId: CC, lockedHoldingCid: '00free' })]
    );
    expect(totals.size).toBe(0);
  });
});

describe('expiredUnclaimedLocks', () => {
  const at = Date.parse('2026-11-13T12:00:00Z');
  const lock = (contractId: string, lockExpiresAt?: string): Holding => ({
    ...holding(contractId, '2', true, CC),
    ...(lockExpiresAt !== undefined && { lockExpiresAt }),
  });

  it('keeps expired Canton Coin locks no offer names, and nothing else', () => {
    const orphan = lock('00orphan', '2026-11-13T00:00:00Z');
    const found = expiredUnclaimedLocks(
      [
        orphan,
        lock('00named', '2026-11-13T00:00:00Z'), // its offer is still active: withdrawing it unlocks it
        lock('00live', '2026-11-14T00:00:00Z'), // not expired yet
        lock('00relative'), // no absolute expiry
        holding('00free', '3', false, CC),
        { ...holding('00da', '5', true), lockExpiresAt: '2026-11-13T00:00:00Z' }, // DA: not Canton Coin
      ],
      [{ lockedHoldingCid: '00named' }, {}],
      at
    );
    expect(found).toEqual([orphan]);
  });
});

describe('coveringPreapproval', () => {
  const pre = (contractId: string, instrumentIds: string[], instrumentAdmin = REGISTRAR): TransferPreapproval => ({
    contractId,
    operator: OPERATOR,
    receiver: HOLDER,
    instrumentAdmin,
    instrumentIds,
  });

  it('is covered by an issuer-wide preapproval, or one naming every requested id, of the same admin', () => {
    const wide = pre('00wide', []);
    const listed = pre('00listed', ['XMPL', 'USD']);
    expect(coveringPreapproval([wide], { instrumentAdmin: REGISTRAR, instrumentIds: [] })).toBe(wide);
    expect(coveringPreapproval([wide], { instrumentAdmin: REGISTRAR, instrumentIds: ['XMPL'] })).toBe(wide);
    expect(coveringPreapproval([listed], { instrumentAdmin: REGISTRAR, instrumentIds: ['XMPL'] })).toBe(listed);
    expect(coveringPreapproval([listed], { instrumentAdmin: REGISTRAR, instrumentIds: ['XMPL', 'EUR'] })).toBeNull();
    // A listed preapproval never covers an issuer-wide request.
    expect(coveringPreapproval([listed], { instrumentAdmin: REGISTRAR, instrumentIds: [] })).toBeNull();
    expect(coveringPreapproval([pre('00o', [], OTHER)], { instrumentAdmin: REGISTRAR, instrumentIds: [] })).toBeNull();
  });

  it('is exported from the wallets entry point', () => {
    expect(Wallets.coveringPreapproval).toBe(coveringPreapproval);
    expect(Wallets.walletTokens).toBe(walletTokens);
    expect(Wallets.isTransferOfferExpired).toBe(isTransferOfferExpired);
  });
});

describe('walletTokens', () => {
  const ccBalance: InstrumentBalance = {
    key: CC_KEY,
    instrumentId: CC,
    unlocked: '12.5000000000',
    locked: '4.0000000000',
    lockedInExpiredOffers: '4.0000000000',
    holdingCount: 3,
    source: 'amulet',
    metadata: { name: 'Canton Coin', symbol: 'CC', decimals: 10 },
  };
  const cntn = { admin: REGISTRAR, id: 'CNTN' } as const;
  const cntnBalance: InstrumentBalance = {
    key: `CNTN@${REGISTRAR}`,
    instrumentId: cntn,
    unlocked: '7.0000000000',
    locked: '0.0000000000',
    lockedInExpiredOffers: '0.0000000000',
    holdingCount: 1,
    source: 'da-registry',
    metadata: { name: 'Canton Network Token', symbol: 'CNTN', decimals: 2 },
  };
  const ccExpired = offer({
    contractId: '00ccold',
    registry: 'amulet',
    instrumentId: CC,
    expired: true,
    lockedHoldingCid: '00cclock',
  });
  const ccIn = offer({ contractId: '00ccin', registry: 'amulet', instrumentId: CC, sender: OTHER, receiver: HOLDER });
  const preapproval: TransferPreapproval = {
    contractId: '00pre',
    operator: OPERATOR,
    receiver: HOLDER,
    instrumentAdmin: REGISTRAR,
    instrumentIds: [],
  };

  it('gives Canton Coin and DA tokens one shape, sorted by symbol, with honest capabilities', () => {
    const tokens = walletTokens({
      balances: [cntnBalance, ccBalance],
      transferOffers: { incoming: [ccIn], outgoing: [ccExpired, offer({ contractId: '00live', instrumentId: cntn })] },
      mintOffers: [],
      burnRequests: [],
      transferPreapprovals: [preapproval],
    });
    expect(tokens.map((t) => [t.symbol, t.name, t.decimals, t.available, t.locked, t.lockedReclaimable])).toEqual([
      ['CC', 'Canton Coin', 10, '12.5000000000', '4.0000000000', '4.0000000000'],
      ['CNTN', 'Canton Network Token', 2, '7.0000000000', '0.0000000000', '0.0000000000'],
    ]);
    expect(tokens.map((t) => [t.symbol, t.canReclaim, t.preapprovalStatus])).toEqual([
      ['CC', true, 'unknown'],
      ['CNTN', false, 'covered'],
    ]);
    const [cc, cntnToken] = tokens;
    expect(cc).toMatchObject({
      key: CC_KEY,
      isCantonCoin: true,
      capabilities: {
        send: false,
        burn: false,
        preapprove: false,
        answerOffers: true,
        withdrawOffers: true,
        answerMintOffers: false,
      },
      preapproval: null,
    });
    expect(cc?.offers.incoming.map((o) => o.contractId)).toEqual(['00ccin']);
    expect(cc?.offers.expiredIncoming).toEqual([]);
    expect(cc?.offers.expiredOutgoing.map((o) => o.contractId)).toEqual(['00ccold']);
    expect(cntnToken).toMatchObject({
      isCantonCoin: false,
      capabilities: { send: true, burn: true, preapprove: true },
      preapproval,
    });
    expect(cntnToken?.offers.outgoing.map((o) => o.contractId)).toEqual(['00live']);
    expect(cntnToken?.offers.expiredOutgoing).toEqual([]);
  });

  it('separates expired incoming offers, which the party can no longer accept', () => {
    const old = { ...ccIn, contractId: '00ccinold', expired: true };
    const [cc] = walletTokens({
      balances: [ccBalance],
      transferOffers: { incoming: [ccIn, old], outgoing: [] },
      mintOffers: [],
      burnRequests: [],
      transferPreapprovals: [],
    });
    expect(cc?.offers.incoming.map((o) => o.contractId)).toEqual(['00ccin', '00ccinold']);
    expect(cc?.offers.expiredIncoming.map((o) => o.contractId)).toEqual(['00ccinold']);
  });

  it("counts expired Canton Coin locks no offer names as reclaimable, capped at locked, and says there's a reclaim", () => {
    const [cc] = walletTokens({
      balances: [{ ...ccBalance, lockedInExpiredOffers: '0.0000000000', lockedInExpiredLocks: '1.5000000000' }],
      transferOffers: { incoming: [], outgoing: [] },
      mintOffers: [],
      burnRequests: [],
      transferPreapprovals: [],
    });
    expect(cc).toMatchObject({ lockedReclaimable: '1.5000000000', canReclaim: true });
    const [capped] = walletTokens({
      balances: [{ ...ccBalance, lockedInExpiredLocks: '3.0000000000' }],
      transferOffers: { incoming: [], outgoing: [] },
      mintOffers: [],
      burnRequests: [],
      transferPreapprovals: [],
    });
    expect(capped?.lockedReclaimable).toBe('4.0000000000');
  });

  it('labels Canton Coin CC when the party is only offered it (no balance carries its metadata)', () => {
    const [cc] = walletTokens({
      balances: [],
      transferOffers: { incoming: [ccIn], outgoing: [] },
      mintOffers: [],
      burnRequests: [],
      transferPreapprovals: [],
    });
    expect(cc).toMatchObject({
      symbol: 'CC',
      name: 'Canton Coin',
      decimals: 10,
      isCantonCoin: true,
      available: '0.0000000000',
      canReclaim: false,
      preapprovalStatus: 'unknown',
    });
  });

  it('lists a DA token the party is only offered, with zero balances and its id as the label', () => {
    const tokens = walletTokens({
      balances: [],
      transferOffers: { incoming: [], outgoing: [] },
      mintOffers: [
        {
          contractId: '00mint',
          operator: OPERATOR,
          provider: REGISTRAR,
          holder: HOLDER,
          instrumentId: cntn,
          amount: '10',
          reference: 'm-1',
          memo: 'Welcome',
          requestedAt: '2026-11-12T00:00:00Z',
          executeBefore: '2026-11-20T00:00:00Z',
        },
      ],
      burnRequests: [],
      transferPreapprovals: [],
    });
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatchObject({
      symbol: 'CNTN',
      name: 'CNTN',
      decimals: 10,
      available: '0.0000000000',
      locked: '0.0000000000',
      lockedReclaimable: '0.0000000000',
      holdingCount: 0,
      isCantonCoin: false,
      mintOffers: [{ contractId: '00mint', memo: 'Welcome' }],
      preapproval: null,
      preapprovalStatus: 'none',
      canReclaim: false,
    });
    expect(tokens[0]).not.toHaveProperty('metadata');
  });
});
