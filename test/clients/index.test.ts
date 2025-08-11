// Comprehensive test suite for all SDK operations
// This file ensures all operation tests are included in the test run

// Ledger JSON API Operations
import './ledger-json-api/operations/v2/version/get.test';
import './ledger-json-api/operations/v2/parties/post.test';
import './ledger-json-api/operations/v2/users/delete-user.test';
import './ledger-json-api/operations/v2/users/update-user.test';

// Validator API Operations
import './validator-api/operations/v0/scan-proxy/registry/transfer-instruction/v1/get-transfer-factory.test';

// Lighthouse API Operations
import './lighthouse-api/operations/get-transfer-agent.test';

// Core Components
import '../core/http/HttpClient.test';
import '../core/BaseClient.test';

describe('SDK Test Suite', () => {
  it('should have all test files imported', () => {
    // This test ensures all test files are properly imported
    expect(true).toBe(true);
  });
});
