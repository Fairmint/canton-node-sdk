import { MockLedgerJsonApiClient } from '../../../../../utils';
import { SubmitAndWait } from '../../../../../../src/clients/ledger-json-api/operations/v2/commands/submit-and-wait';
import { mockClientConfig, mockApiUrls } from '../../../../../config/testConfig';

describe('SubmitAndWait Operation', () => {
  let mockClient: MockLedgerJsonApiClient;
  let operation: InstanceType<typeof SubmitAndWait>;

  beforeEach(() => {
    mockClient = new MockLedgerJsonApiClient(mockClientConfig);
    operation = new SubmitAndWait(mockClient);
    mockClient.clearMocks();
  });

  describe('Network Activity Validation', () => {
    it('should make a POST request to the correct commands endpoint', async () => {
      // Arrange
      const params = {
        commands: [
          {
            command: {
              type: 'Create',
              templateId: 'template-1',
              arguments: { field: 'value' },
            },
            meta: {
              ledgerEffectiveTime: '2023-01-01T00:00:00Z',
            },
          },
        ],
        readAs: ['party1', 'party2'],
        actAs: ['party1'],
      } as any;
      const mockResponse = {
        transaction: {
          transactionId: 'tx-123',
          status: 'Committed',
        },
      };
      const expectedUrl = `${mockApiUrls.LEDGER_JSON_API}/v2/commands/submit-and-wait`;
      
      mockClient.setMockResponse(expectedUrl, mockResponse);

      // Act
      const result = await operation.execute(params);

      // Assert
      expect(result).toEqual(mockResponse);
      
      const requests = mockClient.getRequests();
      expect(requests).toHaveLength(1);
      
      const request = requests[0];
      expect(request).toBeDefined();
      expect(request!.method).toBe('POST');
      expect(request!.url).toBe(expectedUrl);
      expect(request!.data).toMatchObject({
        commands: params.commands,
        readAs: params.readAs,
        actAs: params.actAs,
      });
      expect((request!.data as any).commandId).toBeDefined();
    });

    it('should include proper headers in the request', async () => {
      // Arrange
      const params = {
        commands: [
          {
            command: {
              type: 'Exercise',
              templateId: 'template-2',
              contractId: 'contract-1',
              choice: 'Choice1',
              arguments: { choiceArg: 'value' },
            },
          },
        ],
        readAs: ['party1'],
        actAs: ['party1'],
      } as any;
      const mockResponse = {
        transaction: {
          transactionId: 'tx-456',
          status: 'Committed',
        },
      };
      const expectedUrl = `${mockApiUrls.LEDGER_JSON_API}/v2/commands/submit-and-wait`;
      
      mockClient.setMockResponse(expectedUrl, mockResponse);

      // Act
      await operation.execute(params);

      // Assert
      const request = mockClient.getLastRequest();
      expect(request).toBeDefined();
      expect(request?.headers).toBeDefined();
      expect(request?.headers?.['Content-Type']).toBe('application/json');
    });
  });

  describe('Error Handling', () => {
    it('should propagate network errors', async () => {
      // Arrange
      const params = {
        commands: [
          {
            command: {
              type: 'Create',
              templateId: 'template-error',
              arguments: {},
            },
          },
        ],
        readAs: ['party1'],
        actAs: ['party1'],
      } as any;
      const expectedUrl = `${mockApiUrls.LEDGER_JSON_API}/v2/commands/submit-and-wait`;
      const networkError = new Error('Network error');
      
      mockClient.setMockError(expectedUrl, networkError);

      // Act & Assert
      await expect(operation.execute(params)).rejects.toThrow('Network error');
      
      const requests = mockClient.getRequests();
      expect(requests).toHaveLength(1);
    });

    it('should handle command validation errors', async () => {
      // Arrange
      const params = {
        commands: [
          {
            command: {
              type: 'InvalidType',
              templateId: 'template-invalid',
              arguments: {},
            },
          },
        ],
        readAs: ['party1'],
        actAs: ['party1'],
      } as any;
      const expectedUrl = `${mockApiUrls.LEDGER_JSON_API}/v2/commands/submit-and-wait`;
      const validationError = new Error('Command validation failed');
      
      mockClient.setMockError(expectedUrl, validationError);

      // Act & Assert
      await expect(operation.execute(params)).rejects.toThrow('Command validation failed');
    });
  });

  describe('Parameter Validation', () => {
    it('should accept any parameters since validation is disabled', async () => {
      // Arrange
      const params = {
        // Missing commands but operation accepts any params
        readAs: ['party1'],
        actAs: ['party1'],
      } as any;
      
      // Act & Assert
      // This operation uses z.any() so it accepts any parameters
      await expect(operation.execute(params)).resolves.toBeDefined();
    });

    it('should accept valid parameters without validation errors', async () => {
      // Arrange
      const params = {
        commands: [
          {
            command: {
              type: 'Create',
              templateId: 'template-valid',
              arguments: {},
            },
          },
        ],
        readAs: ['party1'],
        actAs: ['party1'],
      } as any;
      const mockResponse = {
        transaction: {
          transactionId: 'tx-valid',
          status: 'Committed',
        },
      };
      const expectedUrl = `${mockApiUrls.LEDGER_JSON_API}/v2/commands/submit-and-wait`;
      
      mockClient.setMockResponse(expectedUrl, mockResponse);

      // Act & Assert
      await expect(operation.execute(params)).resolves.toEqual(mockResponse);
    });

    it('should handle different command types correctly', async () => {
      // Arrange
      const params = {
        commands: [
          {
            command: {
              type: 'Exercise',
              templateId: 'template-exercise',
              contractId: 'contract-1',
              choice: 'Choice1',
              arguments: {},
            },
          },
        ],
        readAs: ['party1'],
        actAs: ['party1'],
      } as any;
      const mockResponse = {
        transaction: {
          transactionId: 'tx-exercise',
          status: 'Committed',
        },
      };
      const expectedUrl = `${mockApiUrls.LEDGER_JSON_API}/v2/commands/submit-and-wait`;
      
      mockClient.setMockResponse(expectedUrl, mockResponse);

      // Act
      await operation.execute(params);

      // Assert
      const request = mockClient.getLastRequest();
      expect(request).toBeDefined();
      expect((request?.data as any)?.commands[0].command.type).toBe('Exercise');
    });
  });
}); 