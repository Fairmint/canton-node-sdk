import { MockLedgerJsonApiClient } from '../../../../../utils';
import { SubmitAndWaitForTransactionTree } from '../../../../../../src/clients/ledger-json-api/operations/v2/commands/submit-and-wait-for-transaction-tree';
import { mockClientConfig, mockApiUrls } from '../../../../../config/testConfig';

describe('SubmitAndWaitForTransactionTree Operation', () => {
  let mockClient: MockLedgerJsonApiClient;
  let operation: InstanceType<typeof SubmitAndWaitForTransactionTree>;

  beforeEach(() => {
    mockClient = new MockLedgerJsonApiClient(mockClientConfig);
    operation = new SubmitAndWaitForTransactionTree(mockClient);
    mockClient.clearMocks();
  });

  describe('Network Activity Validation', () => {
    it('should make a POST request to the correct commands endpoint', async () => {
      // Arrange
      const params = {
        commands: [
          {
            CreateCommand: {
              templateId: 'template-1',
              createArguments: { field: 'value' },
            },
          },
        ],
        readAs: ['party1', 'party2'],
        actAs: ['party1'],
      };
      const mockResponse = {
        transactionTree: {
          transactionId: 'tx-123',
          status: 'Committed',
          nodes: [],
        },
      };
      const expectedUrl = `${mockApiUrls.LEDGER_JSON_API}/v2/commands/submit-and-wait-for-transaction-tree`;
      
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
            ExerciseCommand: {
              templateId: 'template-2',
              contractId: 'contract-1',
              choice: 'Choice1',
              choiceArgument: { choiceArg: 'value' },
            },
          },
        ],
        readAs: ['party1'],
        actAs: ['party1'],
      };
      const mockResponse = {
        transactionTree: {
          transactionId: 'tx-456',
          status: 'Committed',
          nodes: [],
        },
      };
      const expectedUrl = `${mockApiUrls.LEDGER_JSON_API}/v2/commands/submit-and-wait-for-transaction-tree`;
      
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
            CreateCommand: {
              templateId: 'template-error',
              createArguments: {},
            },
          },
        ],
        readAs: ['party1'],
        actAs: ['party1'],
      };
      const expectedUrl = `${mockApiUrls.LEDGER_JSON_API}/v2/commands/submit-and-wait-for-transaction-tree`;
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
            InvalidCommand: {
              invalidField: 'invalid',
            },
          },
        ],
        readAs: ['party1'],
        actAs: ['party1'],
      } as any;
      const expectedUrl = `${mockApiUrls.LEDGER_JSON_API}/v2/commands/submit-and-wait-for-transaction-tree`;
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
        commands: [
          {
            CreateCommand: {
              templateId: 'template-any',
              createArguments: { anyField: 'anyValue' },
            },
          },
        ],
        readAs: ['party1'],
        actAs: ['party1'],
      };
      const mockResponse = {
        transactionTree: {
          transactionId: 'tx-any',
          status: 'Committed',
          nodes: [],
        },
      };
      const expectedUrl = `${mockApiUrls.LEDGER_JSON_API}/v2/commands/submit-and-wait-for-transaction-tree`;
      
      mockClient.setMockResponse(expectedUrl, mockResponse);

      // Act & Assert
      // This operation uses z.any() so it accepts any parameters
      await expect(operation.execute(params)).resolves.toBeDefined();
    });

    it('should accept valid parameters without validation errors', async () => {
      // Arrange
      const params = {
        commands: [
          {
            CreateCommand: {
              templateId: 'template-valid',
              createArguments: { validField: 'validValue' },
            },
          },
        ],
        readAs: ['party1'],
        actAs: ['party1'],
      };
      const mockResponse = {
        transactionTree: {
          transactionId: 'tx-valid',
          status: 'Committed',
          nodes: [],
        },
      };
      const expectedUrl = `${mockApiUrls.LEDGER_JSON_API}/v2/commands/submit-and-wait-for-transaction-tree`;
      
      mockClient.setMockResponse(expectedUrl, mockResponse);

      // Act & Assert
      await expect(operation.execute(params)).resolves.toEqual(mockResponse);
    });

    it('should handle different command types correctly', async () => {
      // Arrange
      const params = {
        commands: [
          {
            CreateCommand: {
              templateId: 'template-create',
              createArguments: { createField: 'createValue' },
            },
          },
          {
            ExerciseCommand: {
              templateId: 'template-exercise',
              contractId: 'contract-1',
              choice: 'Choice1',
              choiceArgument: { exerciseField: 'exerciseValue' },
            },
          },
        ],
        readAs: ['party1'],
        actAs: ['party1'],
      };
      const mockResponse = {
        transactionTree: {
          transactionId: 'tx-mixed',
          status: 'Committed',
          nodes: [],
        },
      };
      const expectedUrl = `${mockApiUrls.LEDGER_JSON_API}/v2/commands/submit-and-wait-for-transaction-tree`;
      
      mockClient.setMockResponse(expectedUrl, mockResponse);

      // Act
      await operation.execute(params);

      // Assert
      const request = mockClient.getLastRequest();
      expect(request).toBeDefined();
      expect((request?.data as any)?.commands[0].CreateCommand.templateId).toBe('template-create');
      expect((request?.data as any)?.commands[1].ExerciseCommand.choice).toBe('Choice1');
    });
  });
}); 