import type { ScanApiClient } from '../../../src/clients/scan-api';
import type { ValidatorApiClient } from '../../../src/clients/validator-api';
import { getTrafficStatus } from '../../../src/utils/traffic/get-traffic-status';

describe('getTrafficStatus', () => {
  describe('with ValidatorApiClient', () => {
    const mockTrafficResponse = {
      traffic_status: {
        actual: {
          total_consumed: 50000,
          total_limit: 100000,
        },
        target: {
          total_purchased: 150000,
        },
      },
    };

    const createMockValidatorClient = (response = mockTrafficResponse): ValidatorApiClient =>
      ({
        getMemberTrafficStatus: jest.fn().mockResolvedValue(response),
      }) as unknown as ValidatorApiClient;

    it('should return traffic status from validator client', async () => {
      const client = createMockValidatorClient();

      const result = await getTrafficStatus(client);

      expect(result).toEqual({
        consumed: 50000,
        limit: 100000,
        purchased: 150000,
      });
      expect(client.getMemberTrafficStatus).toHaveBeenCalledWith({
        domainId: undefined,
        memberId: undefined,
      });
    });

    it('should pass domainId and memberId when provided', async () => {
      const client = createMockValidatorClient();

      await getTrafficStatus(client, {
        domainId: 'domain-123',
        memberId: 'PAR::party::fingerprint',
      });

      expect(client.getMemberTrafficStatus).toHaveBeenCalledWith({
        domainId: 'domain-123',
        memberId: 'PAR::party::fingerprint',
      });
    });
  });

  describe('with ScanApiClient', () => {
    const mockParticipantResponse = {
      participant_id: 'PAR::resolved-participant::xyz',
    };

    const mockTrafficResponse = {
      traffic_status: {
        actual: {
          total_consumed: 25000,
          total_limit: 75000,
        },
        target: {
          total_purchased: 100000,
        },
      },
    };

    const createMockScanClient = (
      participantResponse = mockParticipantResponse,
      trafficResponse = mockTrafficResponse
    ): ScanApiClient =>
      ({
        getPartyToParticipant: jest.fn().mockResolvedValue(participantResponse),
        getMemberTrafficStatus: jest.fn().mockResolvedValue(trafficResponse),
      }) as unknown as ScanApiClient;

    it('should return traffic status from scan client', async () => {
      const client = createMockScanClient();

      const result = await getTrafficStatus(client, {
        domainId: 'domain-456',
        partyId: 'party-id::abc',
      });

      expect(result).toEqual({
        consumed: 25000,
        limit: 75000,
        purchased: 100000,
      });
    });

    it('should resolve partyId to participantId automatically', async () => {
      const client = createMockScanClient();

      await getTrafficStatus(client, {
        domainId: 'domain-456',
        partyId: 'party-id::abc',
      });

      expect(client.getPartyToParticipant).toHaveBeenCalledWith({
        domainId: 'domain-456',
        partyId: 'party-id::abc',
      });
      expect(client.getMemberTrafficStatus).toHaveBeenCalledWith({
        domainId: 'domain-456',
        memberId: 'PAR::resolved-participant::xyz',
      });
    });

    it('should use provided memberId if specified', async () => {
      const client = createMockScanClient();

      await getTrafficStatus(client, {
        domainId: 'domain-456',
        partyId: 'party-id::abc',
        memberId: 'PAR::custom-member::123',
      });

      expect(client.getPartyToParticipant).toHaveBeenCalled();
      expect(client.getMemberTrafficStatus).toHaveBeenCalledWith({
        domainId: 'domain-456',
        memberId: 'PAR::custom-member::123',
      });
    });

    it('should throw error when domainId is missing', async () => {
      const client = createMockScanClient();

      await expect(getTrafficStatus(client, { partyId: 'party-id::abc' } as never)).rejects.toThrow(
        'ScanApiClient requires both domainId and partyId'
      );
    });

    it('should throw error when partyId is missing', async () => {
      const client = createMockScanClient();

      await expect(getTrafficStatus(client, { domainId: 'domain-456' } as never)).rejects.toThrow(
        'ScanApiClient requires both domainId and partyId'
      );
    });
  });
});
