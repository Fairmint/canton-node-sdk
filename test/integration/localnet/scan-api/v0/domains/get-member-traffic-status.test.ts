import { testClients } from '../../../../../setup';

describe('Scan API: getMemberTrafficStatus', () => {
  it('returns traffic status for a member', async () => {
    // Get DSO info and scans to find valid domain and member IDs
    const dsoInfo = await testClients.scanApi.getDsoInfo({});
    const scans = await testClients.scanApi.listDsoScans({});
    const domainIds = Object.keys(scans.scans);

    expect(domainIds.length).toBeGreaterThan(0);
    const domainId = domainIds[0]!;

    const response = await testClients.scanApi.getMemberTrafficStatus({
      domainId,
      memberId: dsoInfo.sv_party_id,
    });

    expect(response).toHaveProperty('traffic_state');
  });
});
