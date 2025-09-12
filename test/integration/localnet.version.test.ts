import { LedgerJsonApiClient } from '../../src/clients/ledger-json-api/LedgerJsonApiClient.generated';

// Integration test: Connect to LocalNet JSON Ledger API and fetch version
// Prereqs: LocalNet JSON API running locally (see cn-quickstart docs) and accessible via CANTON_LOCALNET_LEDGER_JSON_API_URI

const baseUrl = process.env['CANTON_LOCALNET_LEDGER_JSON_API_URI'] || 'http://localhost:8080';

const shouldRun = process.env['RUN_LOCALNET_TESTS'] === '1' || process.env['RUN_LOCALNET_TESTS'] === 'true';

(shouldRun ? describe : describe.skip)('LocalNet Ledger JSON API - GetVersion', () => {
  it('returns version information from /v2/version', async () => {
    const client = new LedgerJsonApiClient({
      // Network value is required by the SDK types but not used by this test
      network: 'devnet',
      // We deliberately omit provider and authUrl because this endpoint should not require auth
      apis: {
        LEDGER_JSON_API: {
          apiUrl: baseUrl,
          auth: {
            // Empty clientId instructs the SDK to skip OAuth and send no Authorization header
            grantType: 'client_credentials',
            clientId: '',
          },
        },
      },
    });

    const version = await client.getVersion();
    expect(version).toBeDefined();
    // Common fields expected from JSON Ledger API version endpoint
    // We assert at least one identifying field exists as a string
    expect(typeof (version as any).version).toBe('string');
  }, 30000);
});


