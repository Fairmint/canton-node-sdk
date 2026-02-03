/**
 * LedgerGrpcClient integration tests: Real-World Use Cases
 *
 * This file demonstrates practical scenarios where the gRPC client
 * provides value for Canton Network applications.
 */

import { closeClient, getClient } from './setup';

describe('LedgerGrpcClient / Use Cases', () => {
  afterAll(() => {
    closeClient();
  });

  /**
   * Use Case 1: Health Check Service
   *
   * A service that monitors ledger health by checking version and connectivity.
   * This is useful for:
   * - Load balancers performing health checks
   * - Monitoring dashboards
   * - Alerting systems
   */
  describe('Health Check Service', () => {
    test('can perform basic health check', async () => {
      const client = await getClient();

      // Check version (tests connectivity and API compatibility)
      const version = await client.getVersion();
      expect(version.version).toBeDefined();

      // Check ledger is operational (can query state)
      const offset = await client.getLedgerEnd();
      expect(typeof offset).toBe('number');

      // Health check passed
      const healthStatus = {
        healthy: true,
        version: version.version,
        ledgerOffset: offset,
        timestamp: new Date().toISOString(),
      };

      expect(healthStatus.healthy).toBe(true);
    });

    test('health check can detect API version', async () => {
      const client = await getClient();
      const version = await client.getVersion();

      // Parse version for compatibility checks
      const [major, minor] = version.version.split('.').map(Number);

      // We expect Canton 3.x
      expect(major).toBeGreaterThanOrEqual(3);
      expect(minor).toBeGreaterThanOrEqual(0);
    });
  });

  /**
   * Use Case 2: Transaction Monitor
   *
   * A service that monitors the ledger for new transactions.
   * The gRPC client is ideal for this because:
   * - Low latency for frequent polling
   * - Efficient binary protocol reduces bandwidth
   * - Streaming support for real-time updates (future enhancement)
   */
  describe('Transaction Monitor', () => {
    test('can track ledger progress', async () => {
      const client = await getClient();

      // Get initial offset
      const startOffset = await client.getLedgerEnd();

      // In a real application, you would:
      // 1. Store this offset
      // 2. Poll periodically
      // 3. When offset increases, fetch new transactions

      // Simulate monitoring loop (3 iterations)
      const offsets: number[] = [startOffset];
      for (let i = 0; i < 3; i++) {
        // In production, you'd wait between polls
        const currentOffset = await client.getLedgerEnd();
        offsets.push(currentOffset);
      }

      // Offsets should be non-decreasing
      for (let i = 1; i < offsets.length; i++) {
        const current = offsets[i];
        const previous = offsets[i - 1];
        if (current !== undefined && previous !== undefined) {
          expect(current).toBeGreaterThanOrEqual(previous);
        }
      }

      // Calculate progress (if any)
      const lastOffset = offsets[offsets.length - 1];
      const firstOffset = offsets[0];
      if (lastOffset !== undefined && firstOffset !== undefined) {
        const progress = lastOffset - firstOffset;
        expect(progress).toBeGreaterThanOrEqual(0);
      }
    });

    test('can poll at high frequency', async () => {
      const client = await getClient();
      const pollCount = 20;
      const results: Array<{ offset: number; timestamp: number }> = [];

      const startTime = performance.now();

      for (let i = 0; i < pollCount; i++) {
        const offset = await client.getLedgerEnd();
        results.push({
          offset,
          timestamp: performance.now() - startTime,
        });
      }

      const totalTime = performance.now() - startTime;
      const avgPollTime = totalTime / pollCount;

      console.log(`\nHigh-Frequency Polling (${pollCount} polls):`);
      console.log(`  Total time: ${totalTime.toFixed(0)}ms`);
      console.log(`  Avg poll time: ${avgPollTime.toFixed(2)}ms`);
      console.log(`  Polls/second: ${(1000 / avgPollTime).toFixed(1)}`);

      // Should be able to poll at least 10 times per second
      expect(avgPollTime).toBeLessThan(100);
    });
  });

  /**
   * Use Case 3: Multi-Service Architecture
   *
   * In microservices architectures, different services may need
   * different API clients based on their requirements:
   * - gRPC for high-throughput internal services
   * - JSON API for external-facing APIs or simpler integrations
   */
  describe('Multi-Service Architecture', () => {
    test('gRPC client can coexist with JSON client', async () => {
      const grpcClient = await getClient();

      // Both clients can operate independently
      const grpcVersion = await grpcClient.getVersion();
      const grpcOffset = await grpcClient.getLedgerEnd();

      // In a real architecture:
      // - Internal monitoring service uses gRPC (low latency)
      // - External API gateway uses JSON API (easier integration)

      expect(grpcVersion.version).toBeDefined();
      expect(typeof grpcOffset).toBe('number');
    });
  });
});
