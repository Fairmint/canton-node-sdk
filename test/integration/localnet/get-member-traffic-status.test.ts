import { testClients } from '../../setup';

describe('LocalNet GetMemberTrafficStatus', () => {
  it('should get traffic status for current party', async () => {
    const response = await testClients.validatorApi.getMemberTrafficStatus();

    // Verify response structure
    expect(response).toHaveProperty('traffic_status');
    expect(response.traffic_status).toHaveProperty('actual');
    expect(response.traffic_status).toHaveProperty('target');
    expect(response.traffic_status.actual).toHaveProperty('total_consumed');
    expect(response.traffic_status.actual).toHaveProperty('total_limit');
    expect(response.traffic_status.target).toHaveProperty('total_purchased');

    // Verify types
    expect(typeof response.traffic_status.actual.total_consumed).toBe('number');
    expect(typeof response.traffic_status.actual.total_limit).toBe('number');
    expect(typeof response.traffic_status.target.total_purchased).toBe('number');
  });

  it('should get traffic status with optional parameters', async () => {
    // First get the current party ID
    const userStatus = await testClients.validatorApi.getUserStatus();
    const partyId = userStatus.party_id;

    // Get traffic status with explicit memberId
    const response = await testClients.validatorApi.getMemberTrafficStatus({
      memberId: partyId,
    });

    expect(response).toHaveProperty('traffic_status');
    expect(response.traffic_status.actual).toHaveProperty('total_consumed');
    expect(response.traffic_status.actual).toHaveProperty('total_limit');
  });
});
