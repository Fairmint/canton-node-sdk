import { MockLedgerJsonApiClient } from '../../../../../../utils';
import { AsyncSubmitReassignment } from '../../../../../../../src/clients/ledger-json-api/operations/v2/commands/async/submit-reassignment';
import { mockClientConfig, mockApiUrls } from '../../../../../../config/testConfig';

describe('AsyncSubmitReassignment Operation', () => {
  let mockClient: MockLedgerJsonApiClient;
  let operation: InstanceType<typeof AsyncSubmitReassignment>;

  beforeEach(() => {
    mockClient = new MockLedgerJsonApiClient(mockClientConfig);
    operation = new AsyncSubmitReassignment(mockClient);
    mockClient.clearMocks();
  });

  describe('Network Activity Validation', () => {
    it('should make a POST request to the correct commands endpoint', async () => {
      // Arrange
      const params = {
        reassignmentCommands: {
          commandId: 'cmd-123',
          submitter: 'party1',
          commands: [
            {
              AssignCommand: {
                reassignmentId: 'reassignment-1',
                source: 'source-sync',
                target: 'target-sync',
              },
            },
          ],
        },
      };
      const mockResponse = {
        commandId: 'cmd-123',
        status: 'Submitted',
      };
      const expectedUrl = `${mockApiUrls.LEDGER_JSON_API}/v2/commands/submit-reassignment`;
      
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
        reassignmentCommands: params.reassignmentCommands,
      });
    });

    it('should include proper headers in the request', async () => {
      // Arrange
      const params = {
        reassignmentCommands: {
          commandId: 'cmd-456',
          submitter: 'party1',
          commands: [
            {
              UnassignCommand: {
                contractId: 'contract-1',
              },
            },
          ],
        },
      };
      const mockResponse = {
        commandId: 'cmd-456',
        status: 'Submitted',
      };
      const expectedUrl = `${mockApiUrls.LEDGER_JSON_API}/v2/commands/submit-reassignment`;
      
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
        reassignmentCommands: {
          commandId: 'cmd-error',
          submitter: 'party1',
          commands: [
            {
              AssignCommand: {
                reassignmentId: 'reassignment-error',
                source: 'source-sync',
                target: 'target-sync',
              },
            },
          ],
        },
      };
      const expectedUrl = `${mockApiUrls.LEDGER_JSON_API}/v2/commands/submit-reassignment`;
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
        reassignmentCommands: {
          commandId: 'cmd-validation-error',
          submitter: 'party1',
          commands: [
            {
              InvalidCommand: {
                invalidField: 'invalid',
              },
            },
          ],
        },
      } as any;
      const expectedUrl = `${mockApiUrls.LEDGER_JSON_API}/v2/commands/submit-reassignment`;
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
        reassignmentCommands: {
          commandId: 'cmd-any',
          submitter: 'party1',
          commands: [
            {
              AssignCommand: {
                reassignmentId: 'reassignment-any',
                source: 'source-sync',
                target: 'target-sync',
              },
            },
          ],
        },
      };
      const mockResponse = {
        commandId: 'cmd-any',
        status: 'Submitted',
      };
      const expectedUrl = `${mockApiUrls.LEDGER_JSON_API}/v2/commands/submit-reassignment`;
      
      mockClient.setMockResponse(expectedUrl, mockResponse);

      // Act & Assert
      // This operation uses z.any() so it accepts any parameters
      await expect(operation.execute(params)).resolves.toBeDefined();
    });

    it('should accept valid parameters without validation errors', async () => {
      // Arrange
      const params = {
        reassignmentCommands: {
          commandId: 'cmd-valid',
          submitter: 'party1',
          commands: [
            {
              AssignCommand: {
                reassignmentId: 'reassignment-valid',
                source: 'source-sync',
                target: 'target-sync',
              },
            },
          ],
        },
      };
      const mockResponse = {
        commandId: 'cmd-valid',
        status: 'Submitted',
      };
      const expectedUrl = `${mockApiUrls.LEDGER_JSON_API}/v2/commands/submit-reassignment`;
      
      mockClient.setMockResponse(expectedUrl, mockResponse);

      // Act & Assert
      await expect(operation.execute(params)).resolves.toEqual(mockResponse);
    });

    it('should handle different command types correctly', async () => {
      // Arrange
      const params = {
        reassignmentCommands: {
          commandId: 'cmd-mixed',
          submitter: 'party1',
          commands: [
            {
              AssignCommand: {
                reassignmentId: 'reassignment-assign',
                source: 'source-sync',
                target: 'target-sync',
              },
            },
            {
              UnassignCommand: {
                contractId: 'contract-1',
              },
            },
          ],
        },
      };
      const mockResponse = {
        commandId: 'cmd-mixed',
        status: 'Submitted',
      };
      const expectedUrl = `${mockApiUrls.LEDGER_JSON_API}/v2/commands/submit-reassignment`;
      
      mockClient.setMockResponse(expectedUrl, mockResponse);

      // Act
      await operation.execute(params);

      // Assert
      const request = mockClient.getLastRequest();
      expect(request).toBeDefined();
      expect((request?.data as any)?.reassignmentCommands.commands[0].AssignCommand.reassignmentId).toBe('reassignment-assign');
      expect((request?.data as any)?.reassignmentCommands.commands[1].UnassignCommand.contractId).toBe('contract-1');
    });
  });
}); 