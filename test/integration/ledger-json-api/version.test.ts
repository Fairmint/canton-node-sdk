/**
 * End-to-end tests for Ledger JSON API version endpoint
 *
 * These tests demonstrate the API usage and validate responses against localnet.
 * They serve as both tests and documentation.
 */

import { createTestClient } from '../helpers/client';
import { assert } from '../helpers/assert';
import type { LedgerJsonApiClient } from '../../../src/clients/ledger-json-api';

describe('Ledger JSON API - Version', () => {
  let client: LedgerJsonApiClient;

  beforeAll(() => {
    client = createTestClient();
  });

  it('getVersion()', async () => {
    const result = await client.getVersion();
    // Document the full API response structure - all attributes must be present
    assert(result).eq({
      version: result.version,
      features: result.features,
    });
  }, 30000);
});
