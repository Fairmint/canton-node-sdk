import { GetVersion } from '../../../../../../src/clients/ledger-json-api/operations/v2/version/get';
import { MockBaseClient } from '../../../../../utils';
import { mockClientConfig } from '../../../../../config/testConfig';

describe('GetVersion Operation - Simple Test', () => {
  let mockClient: MockBaseClient;
  let operation: InstanceType<typeof GetVersion>;

  beforeEach(() => {
    mockClient = new MockBaseClient('LEDGER_JSON_API', mockClientConfig);
    operation = new GetVersion(mockClient);
    mockClient.clearMocks();
  });

  it('should execute without timeout', async () => {
    // Arrange
    const mockResponse = { version: '2.0.0' };
    const expectedUrl = `${mockClient.getApiUrl()}/v2/version`;
    
    mockClient.setMockResponse(expectedUrl, mockResponse);

    // Act
    const result = await operation.execute();

    // Assert
    expect(result).toEqual(mockResponse);
    
    const requests = mockClient.getRequests();
    expect(requests).toHaveLength(1);
    
    const request = requests[0];
    expect(request).toBeDefined();
    expect(request!.method).toBe('GET');
    expect(request!.url).toBe(expectedUrl);
  }, 10000); // Increase timeout to 10 seconds
}); 