/**
 * Integration test: CN-Quickstart LocalNet Connection
 *
 * This test validates that the SDK can connect to cn-quickstart localnet
 * with OAuth2 authentication using the built-in defaults.
 *
 * Prerequisites:
 * - cn-quickstart must be running with OAuth2 enabled
 * - Test assumes standard cn-quickstart ports (3903, 3975, 8082)
 *
 * This test verifies:
 * - SDK can use { network: 'localnet' } with no other configuration
 * - OAuth2 authentication works automatically
 * - Validator API and Ledger JSON API are both accessible
 * - API responses match expected structure
 */

import { LedgerJsonApiClient, ValidatorApiClient } from '../../../src';

describe('CN-Quickstart LocalNet Connection', () => {
  let validatorClient: ValidatorApiClient;
  let jsonClient: LedgerJsonApiClient;

  beforeAll(() => {
    // Simple configuration - SDK handles the rest
    validatorClient = new ValidatorApiClient({
      network: 'localnet',
    });

    jsonClient = new LedgerJsonApiClient({
      network: 'localnet',
    });
  });

  describe('Validator API', () => {
    it('should connect and authenticate', async () => {
      // Explicitly test authentication
      const token = await validatorClient.authenticate();
      expect(token).toBeTruthy();
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(0);
    }, 30000);

    it('should call getUserStatus', async () => {
      const userStatus = await validatorClient.getUserStatus();
      expect(userStatus).toBeDefined();
      expect(userStatus).toHaveProperty('user_onboarded');
      expect(userStatus).toHaveProperty('user_wallet_installed');
      expect(userStatus).toHaveProperty('has_featured_app_right');
      expect(typeof userStatus.user_onboarded).toBe('boolean');
    }, 30000);

    it('should call getDsoPartyId', async () => {
      const dsoPartyId = await validatorClient.getDsoPartyId();
      expect(dsoPartyId).toBeDefined();
      expect(typeof dsoPartyId).toBe('string');
      expect(dsoPartyId).toContain('DSO::');
    }, 30000);
  });

  describe('Ledger JSON API', () => {
    it('should connect and get version', async () => {
      const version = await jsonClient.getVersion();
      expect(version).toBeDefined();
      expect(version).toHaveProperty('version');
      expect(version).toHaveProperty('features');
      expect(typeof version.version).toBe('string');

      // Verify version format (e.g., "3.3.0-SNAPSHOT")
      expect(version.version).toMatch(/^\d+\.\d+\.\d+/);
    }, 30000);

    it('should have expected features', async () => {
      const version = await jsonClient.getVersion();
      expect(version.features).toBeDefined();
      expect(version.features).toHaveProperty('userManagement');
      expect(version.features?.userManagement).toHaveProperty('supported');
      expect(version.features?.userManagement?.supported).toBe(true);
    }, 30000);

    it('should call getLedgerEnd', async () => {
      const ledgerEnd = await jsonClient.getLedgerEnd({});
      expect(ledgerEnd).toBeDefined();
      expect(ledgerEnd).toHaveProperty('offset');
      expect(typeof ledgerEnd.offset).toBe('string');
    }, 30000);
  });

  describe('OAuth2 Authentication', () => {
    it('should reuse cached token for multiple calls', async () => {
      const start = Date.now();

      // First call - will authenticate
      await validatorClient.getUserStatus();
      const firstCallTime = Date.now() - start;

      // Second call - should reuse token
      const secondStart = Date.now();
      await validatorClient.getUserStatus();
      const secondCallTime = Date.now() - secondStart;

      // Second call should be significantly faster (no auth roundtrip)
      expect(secondCallTime).toBeLessThan(firstCallTime);
    }, 30000);
  });

  describe('Default Configuration', () => {
    it('should use app-provider by default', () => {
      const provider = validatorClient.getProvider();
      expect(provider).toBe('app-provider');
    });

    it('should use localnet network', () => {
      const network = validatorClient.getNetwork();
      expect(network).toBe('localnet');
    });

    it('should have configured auth URL', () => {
      const authUrl = validatorClient.getAuthUrl();
      expect(authUrl).toBe('http://localhost:8082/realms/AppProvider/protocol/openid-connect/token');
    });
  });
});
