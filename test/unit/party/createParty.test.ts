import { createParty } from '../../../src/utils/party/createParty';
import type { LedgerJsonApiClient } from '../../../src/clients/ledger-json-api';
import type { ValidatorApiClient } from '../../../src/clients/validator-api';
import * as offersModule from '../../../src/utils/amulet/offers';
import * as preApproveModule from '../../../src/utils/amulet/pre-approve-transfers';
import * as getAmuletsModule from '../../../src/utils/amulet/get-amulets-for-transfer';

// Mock dependencies
jest.mock('../../../src/utils/amulet/offers');
jest.mock('../../../src/utils/amulet/pre-approve-transfers');
jest.mock('../../../src/utils/amulet/get-amulets-for-transfer');

const createMockLedgerClient = (): jest.Mocked<LedgerJsonApiClient> =>
  ({}) as unknown as jest.Mocked<LedgerJsonApiClient>;

const createMockValidatorClient = (): jest.Mocked<ValidatorApiClient> =>
  ({
    createUser: jest.fn().mockResolvedValue({
      party_id: 'alice::fingerprint',
      name: 'alice',
    }),
  }) as unknown as jest.Mocked<ValidatorApiClient>;

describe('createParty', () => {
  let mockLedgerClient: jest.Mocked<LedgerJsonApiClient>;
  let mockValidatorClient: jest.Mocked<ValidatorApiClient>;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockLedgerClient = createMockLedgerClient();
    mockValidatorClient = createMockValidatorClient();

    // Setup mock return values
    (offersModule.createTransferOffer as jest.Mock).mockResolvedValue('transfer-offer-contract-123');
    (offersModule.acceptTransferOffer as jest.Mock).mockResolvedValue({
      transactionTree: { updateId: 'update-123' },
    });
    (preApproveModule.preApproveTransfers as jest.Mock).mockResolvedValue({
      contractId: 'preapproval-contract-123',
      domainId: 'domain-123',
      amuletPaid: '0',
    });
    // Mock getAmuletsForTransfer to return amulets (simulating transfer settled)
    (getAmuletsModule.getAmuletsForTransfer as jest.Mock).mockResolvedValue([
      { contractId: 'amulet-123', templateId: 'Amulet', effectiveAmount: '100', owner: 'alice::fingerprint' },
    ]);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('creates party via validator API', async () => {
    const resultPromise = createParty({
      ledgerClient: mockLedgerClient,
      validatorClient: mockValidatorClient,
      partyName: 'alice',
      amount: '0',
    });

    const result = await resultPromise;

    expect(mockValidatorClient.createUser).toHaveBeenCalledWith({ name: 'alice' });
    expect(result.partyId).toBe('alice::fingerprint');
  });

  it('returns only partyId when amount is 0', async () => {
    const result = await createParty({
      ledgerClient: mockLedgerClient,
      validatorClient: mockValidatorClient,
      partyName: 'alice',
      amount: '0',
    });

    expect(result).toEqual({ partyId: 'alice::fingerprint' });
    expect(result.preapprovalContractId).toBeUndefined();
  });

  it('creates transfer offer and preapproval when amount > 0', async () => {
    const resultPromise = createParty({
      ledgerClient: mockLedgerClient,
      validatorClient: mockValidatorClient,
      partyName: 'alice',
      amount: '100',
    });

    // Allow the async operations to resolve (polling succeeds on first check since mock returns amulets)
    await jest.runAllTimersAsync();

    const result = await resultPromise;

    expect(offersModule.createTransferOffer).toHaveBeenCalledWith({
      ledgerClient: mockLedgerClient,
      receiverPartyId: 'alice::fingerprint',
      amount: '100',
      description: 'Welcome transfer for alice',
    });

    expect(offersModule.acceptTransferOffer).toHaveBeenCalledWith({
      ledgerClient: mockLedgerClient,
      transferOfferContractId: 'transfer-offer-contract-123',
      acceptingPartyId: 'alice::fingerprint',
    });

    expect(preApproveModule.preApproveTransfers).toHaveBeenCalledWith(mockLedgerClient, mockValidatorClient, {
      receiverPartyId: 'alice::fingerprint',
    });

    expect(result.preapprovalContractId).toBe('preapproval-contract-123');
  });

  it('skips funding when amount is "0"', async () => {
    await createParty({
      ledgerClient: mockLedgerClient,
      validatorClient: mockValidatorClient,
      partyName: 'alice',
      amount: '0',
    });

    expect(offersModule.createTransferOffer).not.toHaveBeenCalled();
    expect(offersModule.acceptTransferOffer).not.toHaveBeenCalled();
    expect(preApproveModule.preApproveTransfers).not.toHaveBeenCalled();
  });

  it('throws error for invalid amount (NaN)', async () => {
    await expect(
      createParty({
        ledgerClient: mockLedgerClient,
        validatorClient: mockValidatorClient,
        partyName: 'alice',
        amount: 'invalid',
      })
    ).rejects.toThrow('Invalid amount: "invalid". Amount must be a valid non-negative number.');
  });

  it('throws error for negative amount', async () => {
    await expect(
      createParty({
        ledgerClient: mockLedgerClient,
        validatorClient: mockValidatorClient,
        partyName: 'alice',
        amount: '-10',
      })
    ).rejects.toThrow('Invalid amount: "-10". Amount must be a valid non-negative number.');
  });

  it('accepts decimal amount "100.5"', async () => {
    const resultPromise = createParty({
      ledgerClient: mockLedgerClient,
      validatorClient: mockValidatorClient,
      partyName: 'alice',
      amount: '100.5',
    });

    await jest.runAllTimersAsync();
    await resultPromise;

    expect(offersModule.createTransferOffer).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: '100.5',
      })
    );
  });

  it('uses partyName in transfer description', async () => {
    const resultPromise = createParty({
      ledgerClient: mockLedgerClient,
      validatorClient: mockValidatorClient,
      partyName: 'bob',
      amount: '50',
    });

    await jest.runAllTimersAsync();
    await resultPromise;

    expect(offersModule.createTransferOffer).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'Welcome transfer for bob',
      })
    );
  });
});
