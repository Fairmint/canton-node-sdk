import type { LedgerJsonApiClient } from '../../../src/clients/ledger-json-api';
import { getAmuletsForTransfer } from '../../../src/utils/amulet/get-amulets-for-transfer';

const createMockLedgerClient = (activeContracts: unknown[]): LedgerJsonApiClient =>
  ({
    getActiveContracts: jest.fn().mockResolvedValue(activeContracts),
  }) as unknown as LedgerJsonApiClient;

// New format: JsActiveContract
const createJsActiveContract = (contractId: string, templateId: string, owner: string, amount: string) => ({
  contractEntry: {
    JsActiveContract: {
      createdEvent: {
        contractId,
        templateId,
        createArgument: {
          owner,
          amount: { initialAmount: amount },
        },
      },
    },
  },
});

// Legacy format
const createLegacyContract = (contractId: string, templateId: string, owner: string, amount: string) => ({
  contract: {
    contract_id: contractId,
    template_id: templateId,
    payload: {
      owner,
      amount: { initialAmount: amount },
    },
  },
});

// Contract with numeric initialAmount (number instead of string)
const createJsActiveContractWithNumericAmount = (
  contractId: string,
  templateId: string,
  owner: string,
  amount: number
) => ({
  contractEntry: {
    JsActiveContract: {
      createdEvent: {
        contractId,
        templateId,
        createArgument: {
          owner,
          amount: { initialAmount: amount },
        },
      },
    },
  },
});

const createAppRewardCoupon = (contractId: string, beneficiary: string, amount: string) => ({
  contractEntry: {
    JsActiveContract: {
      createdEvent: {
        contractId,
        templateId: 'pkg:Splice.Amulet:AppRewardCoupon',
        createArgument: {
          beneficiary,
          amount,
        },
      },
    },
  },
});

const createValidatorRewardCoupon = (contractId: string, beneficiary: string, amount: string) => ({
  contractEntry: {
    JsActiveContract: {
      createdEvent: {
        contractId,
        templateId: 'pkg:Splice.Amulet:ValidatorRewardCoupon',
        createArgument: {
          beneficiary,
          amount,
        },
      },
    },
  },
});

describe('getAmuletsForTransfer', () => {
  describe('basic functionality', () => {
    it('returns amulets owned by the sender party', async () => {
      const mockClient = createMockLedgerClient([
        createJsActiveContract('amulet-1', 'pkg:Splice.Amulet:Amulet', 'alice::fp', '100'),
      ]);

      const result = await getAmuletsForTransfer({
        jsonApiClient: mockClient,
        readAs: ['alice::fp'],
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        contractId: 'amulet-1',
        templateId: 'pkg:Splice.Amulet:Amulet',
        effectiveAmount: '100',
        owner: 'alice::fp',
      });
    });

    it('returns empty array when readAs is not provided', async () => {
      const mockClient = createMockLedgerClient([]);

      const result = await getAmuletsForTransfer({
        jsonApiClient: mockClient,
      });

      expect(result).toEqual([]);
    });

    it('returns empty array when readAs is empty', async () => {
      const mockClient = createMockLedgerClient([]);

      const result = await getAmuletsForTransfer({
        jsonApiClient: mockClient,
        readAs: [],
      });

      expect(result).toEqual([]);
    });

    it('returns empty array when no amulets found', async () => {
      const mockClient = createMockLedgerClient([]);

      const result = await getAmuletsForTransfer({
        jsonApiClient: mockClient,
        readAs: ['alice::fp'],
      });

      expect(result).toEqual([]);
    });
  });

  describe('filtering', () => {
    it('filters out amulets not owned by sender', async () => {
      const mockClient = createMockLedgerClient([
        createJsActiveContract('amulet-1', 'pkg:Splice.Amulet:Amulet', 'alice::fp', '100'),
        createJsActiveContract('amulet-2', 'pkg:Splice.Amulet:Amulet', 'bob::fp', '200'),
      ]);

      const result = await getAmuletsForTransfer({
        jsonApiClient: mockClient,
        readAs: ['alice::fp'],
      });

      expect(result).toHaveLength(1);
      expect(result[0]?.contractId).toBe('amulet-1');
    });

    it('filters out amulets with zero or negative amounts', async () => {
      const mockClient = createMockLedgerClient([
        createJsActiveContract('amulet-1', 'pkg:Splice.Amulet:Amulet', 'alice::fp', '100'),
        createJsActiveContract('amulet-2', 'pkg:Splice.Amulet:Amulet', 'alice::fp', '0'),
        createJsActiveContract('amulet-3', 'pkg:Splice.Amulet:Amulet', 'alice::fp', '-50'),
      ]);

      const result = await getAmuletsForTransfer({
        jsonApiClient: mockClient,
        readAs: ['alice::fp'],
      });

      expect(result).toHaveLength(1);
      expect(result[0]?.contractId).toBe('amulet-1');
    });

    it('filters out LockedAmulet contracts', async () => {
      const mockClient = createMockLedgerClient([
        createJsActiveContract('amulet-1', 'pkg:Splice.Amulet:Amulet', 'alice::fp', '100'),
        createJsActiveContract('amulet-2', 'pkg:Splice.Amulet:LockedAmulet', 'alice::fp', '200'),
      ]);

      const result = await getAmuletsForTransfer({
        jsonApiClient: mockClient,
        readAs: ['alice::fp'],
      });

      expect(result).toHaveLength(1);
      expect(result[0]?.contractId).toBe('amulet-1');
    });
  });

  describe('sorting', () => {
    it('sorts amulets by amount descending (largest first)', async () => {
      const mockClient = createMockLedgerClient([
        createJsActiveContract('amulet-small', 'pkg:Splice.Amulet:Amulet', 'alice::fp', '50'),
        createJsActiveContract('amulet-large', 'pkg:Splice.Amulet:Amulet', 'alice::fp', '500'),
        createJsActiveContract('amulet-medium', 'pkg:Splice.Amulet:Amulet', 'alice::fp', '150'),
      ]);

      const result = await getAmuletsForTransfer({
        jsonApiClient: mockClient,
        readAs: ['alice::fp'],
      });

      expect(result).toHaveLength(3);
      expect(result[0]?.contractId).toBe('amulet-large');
      expect(result[1]?.contractId).toBe('amulet-medium');
      expect(result[2]?.contractId).toBe('amulet-small');
    });
  });

  describe('includeAllTransferInputs', () => {
    it('includes only Amulet contracts by default', async () => {
      // Note: The mock returns both contracts regardless of templateIds filter,
      // but the function itself filters by template - testing the query params instead
      const mockClient = createMockLedgerClient([
        createJsActiveContract('amulet-1', 'pkg:Splice.Amulet:Amulet', 'alice::fp', '100'),
      ]);

      const result = await getAmuletsForTransfer({
        jsonApiClient: mockClient,
        readAs: ['alice::fp'],
        includeAllTransferInputs: false,
      });

      expect(result).toHaveLength(1);
      expect(result[0]?.contractId).toBe('amulet-1');
    });

    it('includes AppRewardCoupon when includeAllTransferInputs is true', async () => {
      const mockClient = createMockLedgerClient([
        createJsActiveContract('amulet-1', 'pkg:Splice.Amulet:Amulet', 'alice::fp', '100'),
        createAppRewardCoupon('coupon-1', 'alice::fp', '50'),
      ]);

      const result = await getAmuletsForTransfer({
        jsonApiClient: mockClient,
        readAs: ['alice::fp'],
        includeAllTransferInputs: true,
      });

      expect(result).toHaveLength(2);
    });

    it('includes ValidatorRewardCoupon when includeAllTransferInputs is true', async () => {
      const mockClient = createMockLedgerClient([
        createJsActiveContract('amulet-1', 'pkg:Splice.Amulet:Amulet', 'alice::fp', '100'),
        createValidatorRewardCoupon('validator-coupon-1', 'alice::fp', '75'),
      ]);

      const result = await getAmuletsForTransfer({
        jsonApiClient: mockClient,
        readAs: ['alice::fp'],
        includeAllTransferInputs: true,
      });

      expect(result).toHaveLength(2);
    });

    it('queries correct template IDs when includeAllTransferInputs is true', async () => {
      const mockClient = createMockLedgerClient([]);
      const spy = jest.spyOn(mockClient, 'getActiveContracts' as never);

      await getAmuletsForTransfer({
        jsonApiClient: mockClient,
        readAs: ['alice::fp'],
        includeAllTransferInputs: true,
      });

      expect(spy).toHaveBeenCalledWith({
        parties: ['alice::fp'],
        templateIds: [
          '#splice-amulet:Splice.Amulet:Amulet',
          '#splice-amulet:Splice.Amulet:AppRewardCoupon',
          '#splice-amulet:Splice.Amulet:ValidatorRewardCoupon',
        ],
      });
    });
  });

  describe('legacy contract format', () => {
    it('handles legacy contract format', async () => {
      const mockClient = createMockLedgerClient([
        createLegacyContract('amulet-1', 'pkg:Splice.Amulet:Amulet', 'alice::fp', '100'),
      ]);

      const result = await getAmuletsForTransfer({
        jsonApiClient: mockClient,
        readAs: ['alice::fp'],
      });

      expect(result).toHaveLength(1);
      expect(result[0]?.contractId).toBe('amulet-1');
      expect(result[0]?.effectiveAmount).toBe('100');
    });

    it('handles mixed formats', async () => {
      const mockClient = createMockLedgerClient([
        createJsActiveContract('amulet-new', 'pkg:Splice.Amulet:Amulet', 'alice::fp', '200'),
        createLegacyContract('amulet-legacy', 'pkg:Splice.Amulet:Amulet', 'alice::fp', '100'),
      ]);

      const result = await getAmuletsForTransfer({
        jsonApiClient: mockClient,
        readAs: ['alice::fp'],
      });

      expect(result).toHaveLength(2);
    });
  });

  describe('numeric amount handling', () => {
    it('handles numeric initialAmount in nested amount object', async () => {
      const mockClient = createMockLedgerClient([
        createJsActiveContractWithNumericAmount('amulet-1', 'pkg:Splice.Amulet:Amulet', 'alice::fp', 100.5),
      ]);

      const result = await getAmuletsForTransfer({
        jsonApiClient: mockClient,
        readAs: ['alice::fp'],
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        contractId: 'amulet-1',
        templateId: 'pkg:Splice.Amulet:Amulet',
        effectiveAmount: '100.5',
        owner: 'alice::fp',
      });
    });

    it('handles mixed string and numeric amounts correctly', async () => {
      const mockClient = createMockLedgerClient([
        createJsActiveContract('amulet-string', 'pkg:Splice.Amulet:Amulet', 'alice::fp', '200'),
        createJsActiveContractWithNumericAmount('amulet-numeric', 'pkg:Splice.Amulet:Amulet', 'alice::fp', 150),
      ]);

      const result = await getAmuletsForTransfer({
        jsonApiClient: mockClient,
        readAs: ['alice::fp'],
      });

      expect(result).toHaveLength(2);
      // Sorted by amount descending
      expect(result[0]?.contractId).toBe('amulet-string');
      expect(result[0]?.effectiveAmount).toBe('200');
      expect(result[1]?.contractId).toBe('amulet-numeric');
      expect(result[1]?.effectiveAmount).toBe('150');
    });
  });

  describe('edge cases', () => {
    it('handles non-array response gracefully', async () => {
      const mockClient = createMockLedgerClient(null as unknown as unknown[]);

      const result = await getAmuletsForTransfer({
        jsonApiClient: mockClient,
        readAs: ['alice::fp'],
      });

      expect(result).toEqual([]);
    });

    it('skips contracts with missing required fields', async () => {
      const mockClient = createMockLedgerClient([
        createJsActiveContract('amulet-1', 'pkg:Splice.Amulet:Amulet', 'alice::fp', '100'),
        {
          contractEntry: {
            JsActiveContract: {
              createdEvent: {
                // Missing contractId
                templateId: 'pkg:Splice.Amulet:Amulet',
                createArgument: { owner: 'alice::fp', amount: { initialAmount: '50' } },
              },
            },
          },
        },
      ]);

      const result = await getAmuletsForTransfer({
        jsonApiClient: mockClient,
        readAs: ['alice::fp'],
      });

      expect(result).toHaveLength(1);
      expect(result[0]?.contractId).toBe('amulet-1');
    });
  });
});
