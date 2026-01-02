import { executeExternalTransaction } from '../../../src/utils/external-signing/execute-external-transaction';
import type { LedgerJsonApiClient } from '../../../src/clients/ledger-json-api';

const createMockLedgerClient = (): jest.Mocked<LedgerJsonApiClient> =>
  ({
    interactiveSubmissionExecute: jest.fn().mockResolvedValue({
      updateId: 'update-123',
      completionOffset: 'offset-456',
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
});
