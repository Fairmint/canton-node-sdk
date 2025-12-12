import { testClients } from '../../setup';

describe('LocalNet GetMemberTrafficStatus', () => {
  it('should get traffic status for current party', async () => {
    const response = await testClients.validatorApi.getMemberTrafficStatus();

    // Log the full response for debugging
    console.log('Traffic Status Response:', JSON.stringify(response, null, 2));

    // Verify full response structure
    expect(response).toEqual({
      traffic_status: {
        actual: {
          total_consumed: expect.any(Number),
          total_limit: expect.any(Number),
        },
        target: {
          total_purchased: expect.any(Number),
        },
      },
    });
  });

  it('should get traffic status with optional parameters', async () => {
    // First get the current party ID
    const userStatus = await testClients.validatorApi.getUserStatus();
    const partyId = userStatus.party_id;

    // Get traffic status with explicit memberId
    const response = await testClients.validatorApi.getMemberTrafficStatus({
      memberId: partyId,
    });

    console.log('Traffic Status Response (with params):', JSON.stringify(response, null, 2));

    expect(response).toEqual({
      traffic_status: {
        actual: {
          total_consumed: expect.any(Number),
          total_limit: expect.any(Number),
        },
        target: {
          total_purchased: expect.any(Number),
        },
      },
    });
  });
});
