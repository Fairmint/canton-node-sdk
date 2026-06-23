import {
  findCantonCoinBalance,
  normalizeCantonContractItem,
  type CantonWalletBalances,
} from '../../src/utils/canton-response-utils';

describe('canton-response-utils', () => {
  describe('normalizeCantonContractItem', () => {
    it('normalizes flat active contract items', () => {
      expect(
        normalizeCantonContractItem({
          contractId: 'cid',
          templateId: 'pkg:Module:Template',
          createArgument: { owner: 'party' },
          createdEventBlob: 'blob',
        })
      ).toEqual({
        contractId: 'cid',
        templateId: 'pkg:Module:Template',
        createArgument: { owner: 'party' },
        createdEventBlob: 'blob',
        createdAt: null,
      });
    });

    it('normalizes wrapped ledger API active contract items', () => {
      expect(
        normalizeCantonContractItem({
          workflowId: '',
          contractEntry: {
            JsActiveContract: {
              createdEvent: {
                contractId: 'wrapped-cid',
                templateId: 'pkg:Wrapped:Template',
                createArgument: { amount: '1' },
                createdEventBlob: 'wrapped-blob',
                createdAt: '2026-06-15T00:00:00.000Z',
              },
            },
          },
        })
      ).toEqual({
        contractId: 'wrapped-cid',
        templateId: 'pkg:Wrapped:Template',
        createArgument: { amount: '1' },
        createdEventBlob: 'wrapped-blob',
        createdAt: '2026-06-15T00:00:00.000Z',
      });
    });

    it('handles malformed active contract items defensively', () => {
      expect(normalizeCantonContractItem(null)).toEqual({
        contractId: '',
        templateId: '',
        createArgument: null,
        createdEventBlob: null,
        createdAt: null,
      });

      expect(
        normalizeCantonContractItem({
          contractEntry: {
            JsActiveContract: {
              createdEvent: {
                contractId: 123,
                templateId: null,
                createArgument: Symbol('bad'),
                createdEventBlob: 456,
                createdAt: false,
              },
            },
          },
        })
      ).toEqual({
        contractId: '',
        templateId: '',
        createArgument: null,
        createdEventBlob: null,
        createdAt: null,
      });
    });
  });

  describe('findCantonCoinBalance', () => {
    it('finds Canton Coin balances by Amulet instrument id', () => {
      const balances: CantonWalletBalances = {
        partyId: 'party',
        fetchedAt: '2026-06-15T00:00:00.000Z',
        tokens: [
          {
            instrumentId: { admin: 'admin', id: 'USDC' },
            totalUnlockedBalance: '2',
            totalLockedBalance: '0',
            totalBalance: '2',
            unlockedUtxos: [],
            lockedUtxos: [],
          },
          {
            instrumentId: { admin: 'dso', id: 'Amulet' },
            totalUnlockedBalance: '1',
            totalLockedBalance: '3',
            totalBalance: '4',
            unlockedUtxos: [],
            lockedUtxos: [],
          },
        ],
      };

      expect(findCantonCoinBalance(balances, { expectedAdmin: 'dso' })?.totalBalance).toBe('4');
      expect(findCantonCoinBalance(balances, { expectedAdmin: 'unknown' })).toBeNull();
    });

    it('prefers exact Amulet balances before case-insensitive fallbacks', () => {
      const balances: CantonWalletBalances = {
        partyId: 'party',
        fetchedAt: '2026-06-15T00:00:00.000Z',
        tokens: [
          {
            instrumentId: { admin: 'dso', id: 'amulet' },
            totalUnlockedBalance: '1',
            totalLockedBalance: '0',
            totalBalance: '1',
            unlockedUtxos: [],
            lockedUtxos: [],
          },
          {
            instrumentId: { admin: 'dso', id: 'Amulet' },
            totalUnlockedBalance: '4',
            totalLockedBalance: '0',
            totalBalance: '4',
            unlockedUtxos: [],
            lockedUtxos: [],
          },
        ],
      };

      expect(findCantonCoinBalance(balances, { expectedAdmin: 'dso' })?.totalBalance).toBe('4');
    });

    it('does not match arbitrary token ids or admins containing amulet', () => {
      const balances: CantonWalletBalances = {
        partyId: 'party',
        fetchedAt: '2026-06-15T00:00:00.000Z',
        tokens: [
          {
            instrumentId: { admin: 'admin', id: 'FakeAmuletCoin' },
            totalUnlockedBalance: '999',
            totalLockedBalance: '0',
            totalBalance: '999',
            unlockedUtxos: [],
            lockedUtxos: [],
          },
          {
            instrumentId: { admin: 'dso', id: 'amulet' },
            totalUnlockedBalance: '1',
            totalLockedBalance: '0',
            totalBalance: '1',
            unlockedUtxos: [],
            lockedUtxos: [],
          },
        ],
      };

      expect(findCantonCoinBalance(balances, { expectedAdmin: 'dso' })?.totalBalance).toBe('1');
      expect(findCantonCoinBalance(balances, { expectedAdmin: 'admin' })).toBeNull();
      expect(findCantonCoinBalance(balances, { expectedAdmin: ' ' })).toBeNull();
    });
  });
});
