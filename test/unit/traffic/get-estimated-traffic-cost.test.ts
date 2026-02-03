import type { InteractiveSubmissionPrepareResponse } from '../../../src/clients/ledger-json-api/schemas/api/interactive-submission';
import { getEstimatedTrafficCost } from '../../../src/utils/traffic/get-estimated-traffic-cost';
import { UPDATE_CONFIRMATION_OVERHEAD_BYTES } from '../../../src/utils/traffic/types';

describe('getEstimatedTrafficCost', () => {
  it('should return undefined when costEstimation is not present', () => {
    const preparedTransaction: InteractiveSubmissionPrepareResponse = {
      preparedTransactionHash: 'abc123',
      preparedTransaction: 'tx-data',
      hashingSchemeVersion: 'HASHING_SCHEME_VERSION_V2',
    };

    const result = getEstimatedTrafficCost(preparedTransaction);
    expect(result).toBeUndefined();
  });

  it('should extract traffic cost from costEstimation with overhead and dollar cost', () => {
    const preparedTransaction: InteractiveSubmissionPrepareResponse = {
      preparedTransactionHash: 'abc123',
      preparedTransaction: 'tx-data',
      hashingSchemeVersion: 'HASHING_SCHEME_VERSION_V2',
      costEstimation: {
        confirmationRequestTrafficCostEstimation: 1000,
        confirmationResponseTrafficCostEstimation: 500,
        totalTrafficCostEstimation: 1500,
        estimationTimestamp: '2024-01-15T10:30:00Z',
      },
    };

    const result = getEstimatedTrafficCost(preparedTransaction);

    // 1500 bytes + 5KB overhead = 6620 bytes
    const expectedTotalWithOverhead = 1500 + UPDATE_CONFIRMATION_OVERHEAD_BYTES;
    // Cost: 6000 cents/MB * 6620 bytes / (1024 * 1024) = ~37.88 cents
    const expectedCostInCents = (6000 * expectedTotalWithOverhead) / (1024 * 1024);

    expect(result).toEqual({
      requestCost: 1000,
      responseCost: 500,
      totalCost: 1500,
      totalCostWithOverhead: expectedTotalWithOverhead,
      costInCents: expectedCostInCents,
      costInDollars: expectedCostInCents / 100,
      estimatedAt: '2024-01-15T10:30:00Z',
    });
  });

  it('should handle costEstimation without timestamp', () => {
    const preparedTransaction: InteractiveSubmissionPrepareResponse = {
      preparedTransactionHash: 'abc123',
      costEstimation: {
        confirmationRequestTrafficCostEstimation: 2000,
        confirmationResponseTrafficCostEstimation: 800,
        totalTrafficCostEstimation: 2800,
      },
    };

    const result = getEstimatedTrafficCost(preparedTransaction);

    const expectedTotalWithOverhead = 2800 + UPDATE_CONFIRMATION_OVERHEAD_BYTES;
    const expectedCostInCents = (6000 * expectedTotalWithOverhead) / (1024 * 1024);

    expect(result).toEqual({
      requestCost: 2000,
      responseCost: 800,
      totalCost: 2800,
      totalCostWithOverhead: expectedTotalWithOverhead,
      costInCents: expectedCostInCents,
      costInDollars: expectedCostInCents / 100,
      estimatedAt: undefined,
    });
  });

  it('should handle zero traffic costs (still includes overhead)', () => {
    const preparedTransaction: InteractiveSubmissionPrepareResponse = {
      preparedTransactionHash: 'abc123',
      costEstimation: {
        confirmationRequestTrafficCostEstimation: 0,
        confirmationResponseTrafficCostEstimation: 0,
        totalTrafficCostEstimation: 0,
      },
    };

    const result = getEstimatedTrafficCost(preparedTransaction);

    // Even with 0 traffic, we still have the 5KB overhead
    const expectedTotalWithOverhead = UPDATE_CONFIRMATION_OVERHEAD_BYTES;
    const expectedCostInCents = (6000 * expectedTotalWithOverhead) / (1024 * 1024);

    expect(result).toEqual({
      requestCost: 0,
      responseCost: 0,
      totalCost: 0,
      totalCostWithOverhead: expectedTotalWithOverhead,
      costInCents: expectedCostInCents,
      costInDollars: expectedCostInCents / 100,
      estimatedAt: undefined,
    });
  });

  it('should calculate correct cost for 50KB traffic (example from docs)', () => {
    // Based on the example: 50KB traffic + 5KB overhead = 55KB
    // Cost: 6000 * 55 / 1024 = ~322 cents = $3.22
    const preparedTransaction: InteractiveSubmissionPrepareResponse = {
      preparedTransactionHash: 'abc123',
      costEstimation: {
        confirmationRequestTrafficCostEstimation: 40 * 1024, // 40KB
        confirmationResponseTrafficCostEstimation: 10 * 1024, // 10KB
        totalTrafficCostEstimation: 50 * 1024, // 50KB
      },
    };

    const result = getEstimatedTrafficCost(preparedTransaction);

    expect(result?.totalCost).toBe(50 * 1024);
    expect(result?.totalCostWithOverhead).toBe(55 * 1024);
    // 6000 * 55 * 1024 / (1024 * 1024) = 6000 * 55 / 1024 ≈ 322.27
    expect(result?.costInCents).toBeCloseTo(322.27, 1);
    expect(result?.costInDollars).toBeCloseTo(3.22, 2);
  });
});
