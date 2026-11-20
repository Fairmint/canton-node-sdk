import type { LedgerJsonApiClient } from '../../../src/clients/ledger-json-api';
import {
  createDefaultInteractiveSubmissionDeduplicationPeriod,
  DEFAULT_INTERACTIVE_SUBMISSION_DEDUPLICATION_MS,
  DEFAULT_INTERACTIVE_SUBMISSION_DEDUPLICATION_PERIOD,
  deduplicationPeriodFromMs,
  executeExternalTransaction,
  executeExternalTransactionAndWait,
  type NonEmptyPartySignatures,
} from '../../../src/utils/external-signing/execute-external-transaction';

const PARTY_SIGNATURES = [
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
] satisfies NonEmptyPartySignatures;
const HASHING_SCHEME_VERSION = 'HASHING_SCHEME_VERSION_V2' as const;

const createMockLedgerClient = (): jest.Mocked<LedgerJsonApiClient> =>
  ({
    interactiveSubmissionExecute: jest.fn().mockResolvedValue({}),
    interactiveSubmissionExecuteAndWait: jest.fn().mockResolvedValue({
      updateId: 'update-wait-123',
      completionOffset: 456,
    }),
  }) as unknown as jest.Mocked<LedgerJsonApiClient>;

describe('executeExternalTransaction', () => {
  let mockClient: jest.Mocked<LedgerJsonApiClient>;

  beforeEach(() => {
    mockClient = createMockLedgerClient();
  });

  it('creates an isolated default deduplication period for each submission', () => {
    const first = createDefaultInteractiveSubmissionDeduplicationPeriod();
    const second = createDefaultInteractiveSubmissionDeduplicationPeriod();

    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(first.DeduplicationDuration).not.toBe(second.DeduplicationDuration);
    first.DeduplicationDuration.value.seconds = 60;
    expect(second.DeduplicationDuration.value.seconds).toBe(600);
    expect(DEFAULT_INTERACTIVE_SUBMISSION_DEDUPLICATION_PERIOD.DeduplicationDuration.value.seconds).toBe(600);
    expect(Object.isFrozen(DEFAULT_INTERACTIVE_SUBMISSION_DEDUPLICATION_PERIOD)).toBe(true);
    expect(Object.isFrozen(DEFAULT_INTERACTIVE_SUBMISSION_DEDUPLICATION_PERIOD.DeduplicationDuration)).toBe(true);
  });

  it('defaults to 10 minutes, long enough to cover a 5-minute signed payload plus margin', () => {
    expect(DEFAULT_INTERACTIVE_SUBMISSION_DEDUPLICATION_MS).toBe(10 * 60 * 1000);
    expect(createDefaultInteractiveSubmissionDeduplicationPeriod()).toEqual(
      deduplicationPeriodFromMs(DEFAULT_INTERACTIVE_SUBMISSION_DEDUPLICATION_MS)
    );
  });

  it('builds a deduplication period from milliseconds', () => {
    expect(deduplicationPeriodFromMs(15 * 60_000)).toEqual({
      DeduplicationDuration: { value: { seconds: 900, nanos: 0 } },
    });
    expect(deduplicationPeriodFromMs(1_234)).toEqual({
      DeduplicationDuration: { value: { seconds: 1, nanos: 234_000_000 } },
    });
    expect(deduplicationPeriodFromMs(0)).toEqual({ DeduplicationDuration: { value: { seconds: 0, nanos: 0 } } });
    for (const bad of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, '60000' as unknown as number]) {
      expect(() => deduplicationPeriodFromMs(bad)).toThrow(/non-negative whole number of milliseconds/);
    }
  });

  it('passes a caller deduplication period through unchanged', async () => {
    await executeExternalTransactionAndWait({
      ledgerClient: mockClient,
      preparedTransaction: 'prepared-tx-base64',
      submissionId: 'submission-123',
      partySignatures: PARTY_SIGNATURES,
      deduplicationPeriod: deduplicationPeriodFromMs(20 * 60_000),
    });
    expect(mockClient.interactiveSubmissionExecuteAndWait).toHaveBeenCalledWith(
      expect.objectContaining({
        deduplicationPeriod: { DeduplicationDuration: { value: { seconds: 1200, nanos: 0 } } },
      })
    );
  });

  it('executes external transaction and returns result', async () => {
    const result = await executeExternalTransaction({
      ledgerClient: mockClient,
      userId: 'user-123',
      preparedTransaction: 'prepared-tx-base64',
      submissionId: 'submission-123',
      partySignatures: PARTY_SIGNATURES,
      hashingSchemeVersion: HASHING_SCHEME_VERSION,
    });

    expect(result).toEqual({});
  });

  it('passes required parameters to ledger client', async () => {
    const partySignatures = PARTY_SIGNATURES;

    await executeExternalTransaction({
      ledgerClient: mockClient,
      userId: 'user-123',
      preparedTransaction: 'prepared-tx-base64',
      submissionId: 'submission-123',
      partySignatures,
      hashingSchemeVersion: HASHING_SCHEME_VERSION,
    });

    expect(mockClient.interactiveSubmissionExecute).toHaveBeenCalledWith({
      userId: 'user-123',
      preparedTransaction: 'prepared-tx-base64',
      submissionId: 'submission-123',
      hashingSchemeVersion: 'HASHING_SCHEME_VERSION_V2',
      deduplicationPeriod: {
        DeduplicationDuration: {
          value: { seconds: 600, nanos: 0 },
        },
      },
      partySignatures: {
        signatures: partySignatures,
      },
    });
  });

  it('uses hashing scheme V3 when provided', async () => {
    await executeExternalTransaction({
      ledgerClient: mockClient,
      userId: 'user-123',
      preparedTransaction: 'prepared-tx-base64',
      submissionId: 'submission-123',
      partySignatures: PARTY_SIGNATURES,
      hashingSchemeVersion: 'HASHING_SCHEME_VERSION_V3',
    });

    expect(mockClient.interactiveSubmissionExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        hashingSchemeVersion: 'HASHING_SCHEME_VERSION_V3',
      })
    );
  });

  it('uses custom deduplicationPeriod when provided', async () => {
    const customDeduplication = {
      DeduplicationDuration: {
        value: { seconds: 60, nanos: 0 },
      },
    };

    await executeExternalTransaction({
      ledgerClient: mockClient,
      userId: 'user-123',
      preparedTransaction: 'prepared-tx-base64',
      submissionId: 'submission-123',
      partySignatures: PARTY_SIGNATURES,
      hashingSchemeVersion: HASHING_SCHEME_VERSION,
      deduplicationPeriod: customDeduplication,
    });

    expect(mockClient.interactiveSubmissionExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        deduplicationPeriod: customDeduplication,
      })
    );
  });

  it('forwards the explicitly selected hashing scheme', async () => {
    await executeExternalTransaction({
      ledgerClient: mockClient,
      userId: 'user-123',
      preparedTransaction: 'prepared-tx-base64',
      submissionId: 'submission-123',
      partySignatures: PARTY_SIGNATURES,
      hashingSchemeVersion: HASHING_SCHEME_VERSION,
    });

    expect(mockClient.interactiveSubmissionExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        hashingSchemeVersion: 'HASHING_SCHEME_VERSION_V2',
      })
    );
  });

  it('defaults deduplicationPeriod to 10 minutes', async () => {
    await executeExternalTransaction({
      ledgerClient: mockClient,
      userId: 'user-123',
      preparedTransaction: 'prepared-tx-base64',
      submissionId: 'submission-123',
      partySignatures: PARTY_SIGNATURES,
      hashingSchemeVersion: HASHING_SCHEME_VERSION,
    });

    expect(mockClient.interactiveSubmissionExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        deduplicationPeriod: {
          DeduplicationDuration: {
            value: { seconds: 600, nanos: 0 },
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
    ] satisfies NonEmptyPartySignatures;

    await executeExternalTransaction({
      ledgerClient: mockClient,
      userId: 'user-123',
      preparedTransaction: 'prepared-tx-base64',
      submissionId: 'submission-123',
      partySignatures,
      hashingSchemeVersion: HASHING_SCHEME_VERSION,
    });

    expect(mockClient.interactiveSubmissionExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        partySignatures: {
          signatures: partySignatures,
        },
      })
    );
  });

  it('executes through the typed executeAndWait client method and returns the exact response', async () => {
    const result = await executeExternalTransactionAndWait({
      ledgerClient: mockClient,
      userId: 'user-123',
      preparedTransaction: 'prepared-tx-base64',
      submissionId: 'submission-123',
      partySignatures: PARTY_SIGNATURES,
      hashingSchemeVersion: HASHING_SCHEME_VERSION,
    });

    expect(mockClient.interactiveSubmissionExecuteAndWait).toHaveBeenCalledWith({
      userId: 'user-123',
      preparedTransaction: 'prepared-tx-base64',
      hashingSchemeVersion: 'HASHING_SCHEME_VERSION_V2',
      submissionId: 'submission-123',
      deduplicationPeriod: {
        DeduplicationDuration: {
          value: { seconds: 600, nanos: 0 },
        },
      },
      partySignatures: {
        signatures: PARTY_SIGNATURES,
      },
    });
    expect(result).toEqual({
      updateId: 'update-wait-123',
      completionOffset: 456,
      raw: {
        updateId: 'update-wait-123',
        completionOffset: 456,
      },
    });
  });

  it('omits optional user and forwards minimum ledger time', async () => {
    await executeExternalTransactionAndWait({
      ledgerClient: mockClient,
      preparedTransaction: 'prepared-tx-base64',
      submissionId: 'submission-123',
      partySignatures: PARTY_SIGNATURES,
      hashingSchemeVersion: HASHING_SCHEME_VERSION,
      minLedgerTime: {
        time: {
          MinLedgerTimeRel: {
            value: { seconds: 5, nanos: 0 },
          },
        },
      },
    });

    expect(mockClient.interactiveSubmissionExecuteAndWait.mock.calls[0]?.[0]).not.toHaveProperty('userId');
    expect(mockClient.interactiveSubmissionExecuteAndWait).toHaveBeenCalledWith(
      expect.objectContaining({
        minLedgerTime: {
          time: {
            MinLedgerTimeRel: {
              value: { seconds: 5, nanos: 0 },
            },
          },
        },
      })
    );
  });
});
