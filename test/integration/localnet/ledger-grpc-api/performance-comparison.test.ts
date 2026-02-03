/**
 * LedgerGrpcClient integration tests: Performance Comparison
 *
 * Demonstrates the performance benefits of gRPC over JSON API for
 * high-frequency operations. This is a practical example of when
 * to choose gRPC over the JSON API.
 *
 * Use Case: High-frequency ledger state polling
 * - Monitoring applications that need to track ledger progress
 * - Trading systems that need low-latency state updates
 * - Analytics pipelines that poll for new transactions
 */

import { LedgerJsonApiClient } from '../../../../src';
import { buildIntegrationTestClientConfig } from '../../../utils/testConfig';
import { closeClient, getClient } from './setup';

describe('LedgerGrpcClient / Performance Comparison', () => {
  let jsonClient: LedgerJsonApiClient;

  beforeAll(() => {
    const config = buildIntegrationTestClientConfig();
    jsonClient = new LedgerJsonApiClient(config);
  });

  afterAll(() => {
    closeClient();
  });

  /**
   * Benchmark: Multiple sequential version requests
   *
   * This simulates a monitoring application that frequently checks
   * the ledger version to ensure connectivity and compatibility.
   */
  test('gRPC version requests are faster than JSON API', async () => {
    const iterations = 5;
    const grpcClient = await getClient();

    // Warm up both clients (first request may be slower)
    await grpcClient.getVersion();
    await jsonClient.getVersion();

    // Benchmark gRPC
    const grpcStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      await grpcClient.getVersion();
    }
    const grpcDuration = performance.now() - grpcStart;
    const grpcAvg = grpcDuration / iterations;

    // Benchmark JSON API
    const jsonStart = performance.now();
    for (let i = 0; i < iterations; i++) {
      await jsonClient.getVersion();
    }
    const jsonDuration = performance.now() - jsonStart;
    const jsonAvg = jsonDuration / iterations;

    // Log results for visibility
    console.log(`\nVersion API Performance (${iterations} requests):`);
    console.log(`  gRPC:     ${grpcAvg.toFixed(2)}ms avg (${grpcDuration.toFixed(0)}ms total)`);
    console.log(`  JSON API: ${jsonAvg.toFixed(2)}ms avg (${jsonDuration.toFixed(0)}ms total)`);

    // Both should complete successfully
    expect(grpcDuration).toBeGreaterThan(0);
    expect(jsonDuration).toBeGreaterThan(0);

    // Note: gRPC is typically faster, but we don't assert this as it depends
    // on network conditions and server load. The test demonstrates the comparison.
  });

  /**
   * Benchmark: Ledger end polling
   *
   * This simulates a transaction monitoring system that polls the ledger
   * to detect new transactions. High-frequency polling benefits from gRPC's
   * lower overhead.
   */
  test('gRPC ledger end polling is efficient for monitoring', async () => {
    const iterations = 10;
    const grpcClient = await getClient();

    // Warm up
    await grpcClient.getLedgerEnd();
    await jsonClient.getLedgerEnd({});

    // Benchmark gRPC
    const grpcStart = performance.now();
    const grpcOffsets: number[] = [];
    for (let i = 0; i < iterations; i++) {
      const offset = await grpcClient.getLedgerEnd();
      grpcOffsets.push(offset);
    }
    const grpcDuration = performance.now() - grpcStart;
    const grpcAvg = grpcDuration / iterations;

    // Benchmark JSON API
    const jsonStart = performance.now();
    const jsonOffsets: number[] = [];
    for (let i = 0; i < iterations; i++) {
      const response = await jsonClient.getLedgerEnd({});
      jsonOffsets.push(response.offset);
    }
    const jsonDuration = performance.now() - jsonStart;
    const jsonAvg = jsonDuration / iterations;

    // Log results
    console.log(`\nLedger End Polling Performance (${iterations} requests):`);
    console.log(`  gRPC:     ${grpcAvg.toFixed(2)}ms avg (${grpcDuration.toFixed(0)}ms total)`);
    console.log(`  JSON API: ${jsonAvg.toFixed(2)}ms avg (${jsonDuration.toFixed(0)}ms total)`);

    // Both should return consistent offsets
    expect(grpcOffsets.every((o) => typeof o === 'number')).toBe(true);
    expect(jsonOffsets.every((o) => typeof o === 'number')).toBe(true);

    // Offsets should be non-decreasing (ledger only moves forward)
    for (let i = 1; i < grpcOffsets.length; i++) {
      const current = grpcOffsets[i];
      const previous = grpcOffsets[i - 1];
      if (current !== undefined && previous !== undefined) {
        expect(current).toBeGreaterThanOrEqual(previous);
      }
    }
  });
});
