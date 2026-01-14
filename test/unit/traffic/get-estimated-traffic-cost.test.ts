import type { InteractiveSubmissionPrepareResponse } from '../../../src/clients/ledger-json-api/schemas/api/interactive-submission';
import { getEstimatedTrafficCost } from '../../../src/utils/traffic/get-estimated-traffic-cost';

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

  it('should extract traffic cost from costEstimation', () => {
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

    expect(result).toEqual({
      requestCost: 1000,
      responseCost: 500,
      totalCost: 1500,
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

    expect(result).toEqual({
      requestCost: 2000,
      responseCost: 800,
      totalCost: 2800,
      estimatedAt: undefined,
    });
  });

  it('should handle zero traffic costs', () => {
    const preparedTransaction: InteractiveSubmissionPrepareResponse = {
      preparedTransactionHash: 'abc123',
      costEstimation: {
        confirmationRequestTrafficCostEstimation: 0,
        confirmationResponseTrafficCostEstimation: 0,
        totalTrafficCostEstimation: 0,
      },
    };

    const result = getEstimatedTrafficCost(preparedTransaction);

    expect(result).toEqual({
      requestCost: 0,
      responseCost: 0,
      totalCost: 0,
      estimatedAt: undefined,
    });
  });
});
