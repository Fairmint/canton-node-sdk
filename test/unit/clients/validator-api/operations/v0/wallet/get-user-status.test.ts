import { z } from 'zod';
import { createApiOperation } from '../../../../../../../src/core';
import { type BaseClient } from '../../../../../../../src/core/BaseClient';

// Simple mock of GetUserStatus operation without requiring generated types
const GetUserStatus = createApiOperation<
  void,
  {
    party_id: string;
    user_onboarded: boolean;
    user_wallet_installed: boolean;
    has_featured_app_right: boolean;
  }
>({
  paramsSchema: z.void(),
  method: 'GET',
  buildUrl: (_params: void, apiUrl: string) => `${apiUrl}/api/validator/v0/wallet/user-status`,
});

describe('GetUserStatus operation', () => {
  let mockClient: BaseClient;
  let operation: InstanceType<typeof GetUserStatus>;

  beforeEach(() => {
    mockClient = {
      getApiUrl: jest.fn().mockReturnValue('https://test-validator.example.com'),
      makeGetRequest: jest.fn(),
    } as unknown as BaseClient;

    operation = new GetUserStatus(mockClient);
  });

  it('constructs correct URL for user status endpoint', async () => {
    const url = 'https://test-validator.example.com/api/validator/v0/wallet/user-status';
    const mockResponse = {
      party_id: 'test-party-123',
      user_onboarded: true,
      user_wallet_installed: true,
      has_featured_app_right: false,
    };

    const makeGetRequest = jest.fn().mockResolvedValue(mockResponse);
    mockClient.makeGetRequest = makeGetRequest;

    await operation.execute();

    expect(makeGetRequest).toHaveBeenCalledWith(url, {
      contentType: 'application/json',
      includeBearerToken: true,
    });
  });

  it('returns user status when user is onboarded', async () => {
    const mockResponse = {
      party_id: 'test-party-456',
      user_onboarded: true,
      user_wallet_installed: true,
      has_featured_app_right: true,
    };

    (mockClient.makeGetRequest as jest.Mock).mockResolvedValue(mockResponse);

    const result = await operation.execute();

    expect(result.party_id).toBe('test-party-456');
    expect(result.user_onboarded).toBe(true);
    expect(result.user_wallet_installed).toBe(true);
    expect(result.has_featured_app_right).toBe(true);
  });

  it('returns user status when user is not onboarded', async () => {
    const mockResponse = {
      party_id: 'test-party-789',
      user_onboarded: false,
      user_wallet_installed: false,
      has_featured_app_right: false,
    };

    (mockClient.makeGetRequest as jest.Mock).mockResolvedValue(mockResponse);

    const result = await operation.execute();

    expect(result.party_id).toBe('test-party-789');
    expect(result.user_onboarded).toBe(false);
    expect(result.user_wallet_installed).toBe(false);
    expect(result.has_featured_app_right).toBe(false);
  });
});
