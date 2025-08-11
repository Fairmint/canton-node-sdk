import { MockLedgerJsonApiClient } from '../../../../../utils';
import { GetParticipantId } from '../../../../../../src/clients/ledger-json-api/operations/v2/parties/get-participant-id';
import { mockClientConfig, mockApiUrls } from '../../../../../config/testConfig';

describe('GetParticipantId Operation', () => {
  let mockClient: MockLedgerJsonApiClient;
  let operation: InstanceType<typeof GetParticipantId>;

  beforeEach(() => {
    mockClient = new MockLedgerJsonApiClient(mockClientConfig);
    operation = new GetParticipantId(mockClient);
    mockClient.clearMocks();
  });

  describe('Network Activity Validation', () => {
    it('should make a GET request to the correct participant endpoint', async () => {
      // Arrange
      const params = undefined;
      const mockResponse = {
        participantId: 'participant-123',
        partyId: 'party-123',
        displayName: 'Participant One',
      };
      const expectedUrl = `${mockApiUrls.LEDGER_JSON_API}/v2/parties/participant-id`;
      
      mockClient.setMockResponse(expectedUrl, mockResponse);

      // Act
      const result = await operation.execute(params);

      // Assert
      expect(result).toEqual(mockResponse);
      
      const requests = mockClient.getRequests();
      expect(requests).toHaveLength(1);
      
      const request = requests[0];
      expect(request).toBeDefined();
      expect(request!.method).toBe('GET');
      expect(request!.url).toBe(expectedUrl);
    });

    it('should include proper headers in the request', async () => {
      // Arrange
      const params = undefined;
      const mockResponse = {
        participantId: 'participant-456',
        partyId: 'party-456',
        displayName: 'Participant Two',
      };
      const expectedUrl = `${mockApiUrls.LEDGER_JSON_API}/v2/parties/participant-id`;
      
      mockClient.setMockResponse(expectedUrl, mockResponse);

      // Act
      await operation.execute(params);

      // Assert
      const request = mockClient.getLastRequest();
      expect(request).toBeDefined();
      expect(request?.headers).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should propagate network errors', async () => {
      // Arrange
      const params = undefined;
      const expectedUrl = `${mockApiUrls.LEDGER_JSON_API}/v2/parties/participant-id`;
      const networkError = new Error('Network error');
      
      mockClient.setMockError(expectedUrl, networkError);

      // Act & Assert
      await expect(operation.execute(params)).rejects.toThrow('Network error');
      
      const requests = mockClient.getRequests();
      expect(requests).toHaveLength(1);
    });

    it('should handle participant not found errors', async () => {
      // Arrange
      const params = undefined;
      const expectedUrl = `${mockApiUrls.LEDGER_JSON_API}/v2/parties/participant-id`;
      const notFoundError = new Error('Participant not found');
      
      mockClient.setMockError(expectedUrl, notFoundError);

      // Act & Assert
      await expect(operation.execute(params)).rejects.toThrow('Participant not found');
    });
  });

  describe('Parameter Validation', () => {
    it('should accept valid parameters without validation errors', async () => {
      // Arrange
      const params = undefined;
      const mockResponse = {
        participantId: 'participant-valid',
        partyId: 'party-valid',
        displayName: 'Valid Participant',
      };
      const expectedUrl = `${mockApiUrls.LEDGER_JSON_API}/v2/parties/participant-id`;
      
      mockClient.setMockResponse(expectedUrl, mockResponse);

      // Act & Assert
      await expect(operation.execute(params)).resolves.toEqual(mockResponse);
    });

    it('should handle different participant ID formats', async () => {
      // Arrange
      const params = undefined;
      const mockResponse = {
        participantId: 'PARTY_123_ABC',
        partyId: 'party-123',
        displayName: 'Formatted Participant',
      };
      const expectedUrl = `${mockApiUrls.LEDGER_JSON_API}/v2/parties/participant-id`;
      
      mockClient.setMockResponse(expectedUrl, mockResponse);

      // Act
      const result = await operation.execute(params);

      // Assert
      expect(result).toEqual(mockResponse);
      expect(result.participantId).toBe('PARTY_123_ABC');
    });

    it('should handle numeric participant IDs', async () => {
      // Arrange
      const params = undefined;
      const mockResponse = {
        participantId: '12345',
        partyId: 'party-numeric',
        displayName: 'Numeric Participant',
      };
      const expectedUrl = `${mockApiUrls.LEDGER_JSON_API}/v2/parties/participant-id`;
      
      mockClient.setMockResponse(expectedUrl, mockResponse);

      // Act
      const result = await operation.execute(params);

      // Assert
      expect(result).toEqual(mockResponse);
      expect(result.participantId).toBe('12345');
    });
  });
}); 