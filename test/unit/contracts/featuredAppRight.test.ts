import type { ValidatorApiClient } from '../../../src/clients/validator-api';
import { OperationError } from '../../../src/core/errors';
import { getFeaturedAppRightContractDetails } from '../../../src/utils/contracts/featuredAppRight';

describe('getFeaturedAppRightContractDetails', () => {
  const createMockValidatorClient = (
    featuredAppRight: { contract_id: string; template_id: string; created_event_blob: string } | null,
    domainId = 'domain-123'
  ): ValidatorApiClient =>
    ({
      getPartyId: jest.fn().mockReturnValue('alice::fingerprint'),
      lookupFeaturedAppRight: jest.fn().mockResolvedValue({
        featured_app_right: featuredAppRight,
      }),
      getAmuletRules: jest.fn().mockResolvedValue({
        amulet_rules: {
          domain_id: domainId,
        },
      }),
    }) as unknown as ValidatorApiClient;

  it('returns disclosed contract details when featured app right exists', async () => {
    const mockClient = createMockValidatorClient({
      contract_id: 'far-contract-123',
      template_id: 'pkg:Splice.FeaturedAppRight:FeaturedAppRight',
      created_event_blob: 'blob-abc',
    });

    const result = await getFeaturedAppRightContractDetails(mockClient);

    expect(result).toEqual({
      contractId: 'far-contract-123',
      templateId: 'pkg:Splice.FeaturedAppRight:FeaturedAppRight',
      createdEventBlob: 'blob-abc',
      synchronizerId: 'domain-123',
    });
  });

  it('uses party ID from validator client', async () => {
    const mockClient = createMockValidatorClient({
      contract_id: 'far-contract-123',
      template_id: 'pkg:Splice.FeaturedAppRight:FeaturedAppRight',
      created_event_blob: 'blob-abc',
    });

    await getFeaturedAppRightContractDetails(mockClient);

    expect(mockClient.lookupFeaturedAppRight).toHaveBeenCalledWith({
      partyId: 'alice::fingerprint',
    });
  });

  it('uses domain_id from amulet rules as synchronizerId', async () => {
    const mockClient = createMockValidatorClient(
      {
        contract_id: 'far-contract-123',
        template_id: 'pkg:Splice.FeaturedAppRight:FeaturedAppRight',
        created_event_blob: 'blob-abc',
      },
      'custom-domain-xyz'
    );

    const result = await getFeaturedAppRightContractDetails(mockClient);

    expect(result.synchronizerId).toBe('custom-domain-xyz');
  });

  it('throws OperationError when featured app right is not found', async () => {
    const mockClient = createMockValidatorClient(null);

    await expect(getFeaturedAppRightContractDetails(mockClient)).rejects.toThrow(OperationError);
    await expect(getFeaturedAppRightContractDetails(mockClient)).rejects.toThrow(
      'No featured app right found for party alice::fingerprint'
    );
  });

  it('includes party ID in error context', async () => {
    const mockClient = createMockValidatorClient(null);

    try {
      await getFeaturedAppRightContractDetails(mockClient);
      fail('Expected error to be thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(OperationError);
      const opError = error as OperationError;
      expect(opError.code).toBe('MISSING_CONTRACT');
      expect(opError.context).toEqual({
        partyId: 'alice::fingerprint',
        contractType: 'FeaturedAppRight',
      });
    }
  });

  it('fetches amulet rules to get synchronizer ID', async () => {
    const mockClient = createMockValidatorClient({
      contract_id: 'far-contract-123',
      template_id: 'pkg:Splice.FeaturedAppRight:FeaturedAppRight',
      created_event_blob: 'blob-abc',
    });

    await getFeaturedAppRightContractDetails(mockClient);

    expect(mockClient.getAmuletRules).toHaveBeenCalled();
  });

  it('handles undefined featured_app_right', async () => {
    const mockClient = {
      getPartyId: jest.fn().mockReturnValue('alice::fingerprint'),
      lookupFeaturedAppRight: jest.fn().mockResolvedValue({}),
      getAmuletRules: jest.fn().mockResolvedValue({
        amulet_rules: { domain_id: 'domain-123' },
      }),
    } as unknown as ValidatorApiClient;

    await expect(getFeaturedAppRightContractDetails(mockClient)).rejects.toThrow(OperationError);
  });
});
