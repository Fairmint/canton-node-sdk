import { ScanApiClient } from '../../../src';

/**
 * Integration tests for the Scan API client against localnet.
 *
 * These tests run against the cn-quickstart localnet which exposes
 * the Scan API at http://scan.localhost:4000/api/scan
 */
describe('Scan API Client (localnet)', () => {
  let client: ScanApiClient;

  beforeAll(() => {
    client = new ScanApiClient({
      network: 'localnet',
      endpoints: [{ name: 'localnet', url: 'http://scan.localhost:4000' }],
    });
  });

  describe('Health endpoints', () => {
    it('getVersion returns version info', async () => {
      const response = await client.getVersion({});
      expect(response).toEqual({
        version: expect.any(String),
      });
    });

    it('isLive succeeds', async () => {
      await expect(client.isLive({})).resolves.toBeUndefined();
    });

    it('isReady succeeds', async () => {
      await expect(client.isReady({})).resolves.toBeUndefined();
    });

    it('getHealthStatus returns status', async () => {
      const response = await client.getHealthStatus({});
      expect(response).toEqual({
        status: expect.any(String),
      });
    });
  });

  describe('DSO endpoints', () => {
    it('getDsoInfo returns DSO information', async () => {
      const response = await client.getDsoInfo({});
      expect(response).toEqual({
        sv_user: expect.any(String),
        sv_party_id: expect.any(String),
        dso_party_id: expect.any(String),
        voting_threshold: expect.any(Number),
        latest_open_mining_round: expect.any(Object),
        amulet_rules: expect.any(Object),
        sv_node_states: expect.any(Object),
      });
    });

    it('getDsoPartyId returns party ID', async () => {
      const response = await client.getDsoPartyId({});
      expect(response).toEqual({
        dso_party_id: expect.any(String),
      });
    });

    it('listDsoScans returns scan list', async () => {
      const response = await client.listDsoScans({});
      expect(response).toEqual({
        scans: expect.any(Object),
      });
    });

    it('listDsoSequencers returns sequencer list', async () => {
      const response = await client.listDsoSequencers({});
      expect(response).toEqual({
        sequencers: expect.any(Object),
      });
    });
  });

  describe('Rounds endpoints', () => {
    it('getOpenAndIssuingMiningRounds returns rounds', async () => {
      const response = await client.getOpenAndIssuingMiningRounds({});
      expect(response).toEqual({
        open_mining_rounds: expect.any(Object),
        issuing_mining_rounds: expect.any(Object),
        amulet_rules: expect.any(Object),
      });
    });

    it('getAggregatedRounds returns aggregated data', async () => {
      const response = await client.getAggregatedRounds({});
      expect(response).toHaveProperty('rounds');
    });

    it('getClosedRounds returns closed rounds', async () => {
      const response = await client.getClosedRounds({});
      expect(response).toHaveProperty('closed_rounds');
    });

    it('getRoundOfLatestData returns round number', async () => {
      const response = await client.getRoundOfLatestData({});
      expect(response).toEqual({
        round: expect.any(Number),
      });
    });
  });

  describe('Amulet endpoints', () => {
    it('getAmuletRules returns rules', async () => {
      const response = await client.getAmuletRules({});
      expect(response).toHaveProperty('amulet_rules');
    });
  });

  describe('Featured apps', () => {
    it('listFeaturedAppRights returns rights list', async () => {
      const response = await client.listFeaturedAppRights({});
      expect(response).toHaveProperty('featured_app_rights');
    });
  });

  describe('ANS endpoints', () => {
    it('getAnsRules returns rules', async () => {
      const response = await client.getAnsRules({});
      expect(response).toHaveProperty('ans_rules');
    });

    it('listAnsEntries returns entries', async () => {
      const response = await client.listAnsEntries({ pageSize: 10 });
      expect(response).toHaveProperty('entries');
    });
  });

  describe('Validator endpoints', () => {
    it('listValidatorLicenses returns licenses', async () => {
      const response = await client.listValidatorLicenses({});
      expect(response).toHaveProperty('validator_licenses');
    });
  });

  describe('Vote endpoints', () => {
    it('listDsoRulesVoteRequests returns requests', async () => {
      const response = await client.listDsoRulesVoteRequests({});
      expect(response).toHaveProperty('dso_rules_vote_requests');
    });

    it('listAmuletPriceVotes returns votes', async () => {
      const response = await client.listAmuletPriceVotes({});
      expect(response).toHaveProperty('amulet_price_votes');
    });
  });

  describe('Migration endpoints', () => {
    it('getMigrationSchedule returns schedule', async () => {
      const response = await client.getMigrationSchedule({});
      expect(response).toHaveProperty('schedule');
    });

    it('getSpliceInstanceNames returns instance names', async () => {
      const response = await client.getSpliceInstanceNames({});
      expect(response).toEqual({
        network_name: expect.any(String),
        network_favicon_url: expect.any(String),
        amulet_name: expect.any(String),
        amulet_name_acronym: expect.any(String),
        name_service_name: expect.any(String),
        name_service_name_acronym: expect.any(String),
      });
    });
  });

  describe('Traffic status', () => {
    it('getMemberTrafficStatus returns traffic for a member', async () => {
      // First get the DSO info to find domain and member IDs
      const dsoInfo = await client.getDsoInfo({});
      const scans = await client.listDsoScans({});
      const domainIds = Object.keys(scans.scans);

      if (domainIds.length > 0 && domainIds[0]) {
        const response = await client.getMemberTrafficStatus({
          domainId: domainIds[0],
          memberId: dsoInfo.sv_party_id,
        });
        expect(response).toHaveProperty('traffic_state');
      }
    });
  });
});
