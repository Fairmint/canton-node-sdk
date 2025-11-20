/**
 * End-to-end tests for Ledger JSON API packages endpoints
 *
 * These tests demonstrate the API usage and validate responses against localnet.
 * They serve as both tests and documentation.
 */

import { createTestClient } from '../helpers/client';
import { assert } from '../helpers/assert';
import type { LedgerJsonApiClient } from '../../../src/clients/ledger-json-api';

describe('Ledger JSON API - Packages', () => {
  let client: LedgerJsonApiClient;

  beforeAll(() => {
    client = createTestClient();
  });

  it('listPackages()', async () => {
    const result = await client.listPackages();
    // Document the full API response structure
    // Note: Package IDs will vary, but structure must match exactly
    assert(result).eq({
      packageIds: result.packageIds,
    });
  }, 30000);
});
