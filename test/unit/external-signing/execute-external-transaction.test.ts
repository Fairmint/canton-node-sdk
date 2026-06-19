import type { LedgerJsonApiClient } from '../../../src/clients/ledger-json-api';
import {
  executeExternalTransaction,
  executeExternalTransactionAndWait,
} from '../../../src/utils/external-signing/execute-external-transaction';

const createMockLedgerClient = (): jest.Mocked<LedgerJsonApiClient> =>
  ({
    interactiveSubmissionExecute: jest.fn().mockResolvedValue({
      updateId: 'update-123',
      completionOffset: 'offset-456',
    }),
    getApiUrl: jest.fn().mockReturnValue('https://ledger.example.test'),
    makePostRequest: jest.fn().mockResolvedValue({
      updateId: 'update-wait-123',
    }),
  }) as unknown as jest.Mocked<LedgerJsonApiClient>;

describe('executeExternalTransaction', () => {
  let mockClient: jest.Mocked<LedgerJsonApiClient>;

  beforeEach(() => {
    mockClient = createMockLedgerClient();
  });

  it('executes external transaction and returns result', async () => {
    const result = await executeExternalTransaction({
      ledgerClient: mockClient,
      userId: 'user-123',
      preparedTransaction: 'prepared-tx-base64',
      submissionId: 'submission-123',
      partySignatures: [
        {
          party: 'party::fingerprint',
          signatures: [
            {
              format: 'SIGNATURE_FORMAT_RAW',
              signature: 'sig-base64',
              signedBy: 'fingerprint',
              signingAlgorithmSpec: 'SIGNING_ALGORITHM_SPEC_ED25519',
            },
          ],
        },
      ],
    });

    expect(result['updateId']).toBe('update-123');
    expect(result['completionOffset']).toBe('offset-456');
  });

  it('passes required parameters to ledger client', async () => {
    const partySignatures = [
      {
        party: 'party::fingerprint',
        signatures: [
          {
            format: 'SIGNATURE_FORMAT_RAW',
            signature: 'sig-base64',
            signedBy: 'fingerprint',
            signingAlgorithmSpec: 'SIGNING_ALGORITHM_SPEC_ED25519',
          },
        ],
      },
    ];

    await executeExternalTransaction({
      ledgerClient: mockClient,
      userId: 'user-123',
      preparedTransaction: 'prepared-tx-base64',
      submissionId: 'submission-123',
      partySignatures,
    });

    expect(mockClient.interactiveSubmissionExecute).toHaveBeenCalledWith({
      userId: 'user-123',
      preparedTransaction: 'prepared-tx-base64',
      submissionId: 'submission-123',
      hashingSchemeVersion: 'HASHING_SCHEME_VERSION_V2',
      deduplicationPeriod: {
        DeduplicationDuration: {
          value: { duration: '30s' },
        },
      },
      partySignatures: {
        signatures: partySignatures,
      },
    });
  });

  it('uses custom hashingSchemeVersion when provided', async () => {
    await executeExternalTransaction({
      ledgerClient: mockClient,
      userId: 'user-123',
      preparedTransaction: 'prepared-tx-base64',
      submissionId: 'submission-123',
      partySignatures: [],
      hashingSchemeVersion: 'HASHING_SCHEME_VERSION_V1',
    });

    expect(mockClient.interactiveSubmissionExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        hashingSchemeVersion: 'HASHING_SCHEME_VERSION_V1',
      })
    );
  });

  it('uses custom deduplicationPeriod when provided', async () => {
    const customDeduplication = {
      DeduplicationDuration: {
        value: { duration: '60s' },
      },
    };

    await executeExternalTransaction({
      ledgerClient: mockClient,
      userId: 'user-123',
      preparedTransaction: 'prepared-tx-base64',
      submissionId: 'submission-123',
      partySignatures: [],
      deduplicationPeriod: customDeduplication,
    });

    expect(mockClient.interactiveSubmissionExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        deduplicationPeriod: customDeduplication,
      })
    );
  });

  it('defaults hashingSchemeVersion to V2', async () => {
    await executeExternalTransaction({
      ledgerClient: mockClient,
      userId: 'user-123',
      preparedTransaction: 'prepared-tx-base64',
      submissionId: 'submission-123',
      partySignatures: [],
    });

    expect(mockClient.interactiveSubmissionExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        hashingSchemeVersion: 'HASHING_SCHEME_VERSION_V2',
      })
    );
  });

  it('defaults deduplicationPeriod to 30s', async () => {
    await executeExternalTransaction({
      ledgerClient: mockClient,
      userId: 'user-123',
      preparedTransaction: 'prepared-tx-base64',
      submissionId: 'submission-123',
      partySignatures: [],
    });

    expect(mockClient.interactiveSubmissionExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        deduplicationPeriod: {
          DeduplicationDuration: {
            value: { duration: '30s' },
          },
        },
      })
    );
  });

  it('handles multiple party signatures', async () => {
    const partySignatures = [
      {
        party: 'party1::fp1',
        signatures: [
          {
            format: 'SIGNATURE_FORMAT_RAW',
            signature: 'sig1-base64',
            signedBy: 'fp1',
            signingAlgorithmSpec: 'SIGNING_ALGORITHM_SPEC_ED25519',
          },
        ],
      },
      {
        party: 'party2::fp2',
        signatures: [
          {
            format: 'SIGNATURE_FORMAT_RAW',
            signature: 'sig2-base64',
            signedBy: 'fp2',
            signingAlgorithmSpec: 'SIGNING_ALGORITHM_SPEC_ED25519',
          },
        ],
      },
    ];

    await executeExternalTransaction({
      ledgerClient: mockClient,
      userId: 'user-123',
      preparedTransaction: 'prepared-tx-base64',
      submissionId: 'submission-123',
      partySignatures,
    });

    expect(mockClient.interactiveSubmissionExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        partySignatures: {
          signatures: partySignatures,
        },
      })
    );
  });

  it('handles empty party signatures array', async () => {
    await executeExternalTransaction({
      ledgerClient: mockClient,
      userId: 'user-123',
      preparedTransaction: 'prepared-tx-base64',
      submissionId: 'submission-123',
      partySignatures: [],
    });

    expect(mockClient.interactiveSubmissionExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        partySignatures: {
          signatures: [],
        },
      })
    );
  });

  it('executes external transaction with executeAndWait and returns the update id', async () => {
    const result = await executeExternalTransactionAndWait({
      ledgerClient: mockClient,
      userId: 'user-123',
      preparedTransaction: 'prepared-tx-base64',
      submissionId: 'submission-123',
      partySignatures: [],
    });

    expect(mockClient.makePostRequest.mock.calls).toEqual([
      [
        'https://ledger.example.test/v2/interactive-submission/executeAndWait',
        {
          userId: 'user-123',
          preparedTransaction: 'prepared-tx-base64',
          hashingSchemeVersion: 'HASHING_SCHEME_VERSION_V2',
          submissionId: 'submission-123',
          deduplicationPeriod: {
            DeduplicationDuration: {
              value: { duration: '30s' },
            },
          },
          partySignatures: {
            signatures: [],
          },
        },
        {
          contentType: 'application/json',
          includeBearerToken: true,
        },
      ],
    ]);
    expect(result).toEqual({
      updateId: 'update-wait-123',
      raw: { updateId: 'update-wait-123' },
    });
  });

  it('throws a typed operation error when executeAndWait does not return an update id', async () => {
    mockClient.makePostRequest.mockResolvedValueOnce({ completionOffset: 'offset-only' });

    await expect(
      executeExternalTransactionAndWait({
        ledgerClient: mockClient,
        userId: 'user-123',
        preparedTransaction: 'prepared-tx-base64',
        submissionId: 'submission-123',
        partySignatures: [],
      })
    ).rejects.toMatchObject({
      name: 'OperationError',
      code: 'TRANSACTION_FAILED',
    });
  });
});
