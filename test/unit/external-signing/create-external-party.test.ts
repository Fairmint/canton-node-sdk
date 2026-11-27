import { fingerprintEd25519PublicKey } from '@fairmint/canton-protocol/party';
import { Keypair } from '@stellar/stellar-base';
import { verify } from 'node:crypto';
import type { LedgerJsonApiClient } from '../../../src/clients/ledger-json-api';
import { OperationError } from '../../../src/core/errors';
import { createExternalParty } from '../../../src/utils/external-signing/create-external-party';
import {
  generatedTopologyAnswer,
  type OnboardingTopologyInput,
  PERMISSION,
  testParticipantUid,
} from './fixtures/topology';

// A deterministic keypair for reproducible tests.
const KEYPAIR = Keypair.fromSecret('SBGWSG6BTNCKCOB3DIFBGCVMUPQFYPA2G4O34RMTB343OYPXU5DJDVMN');
const PUBLIC_KEY_DER = Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), KEYPAIR.rawPublicKey()]);
const FINGERPRINT = fingerprintEd25519PublicKey(KEYPAIR.rawPublicKey().toString('base64'));
const PARTY_ID = `alice::${FINGERPRINT}`;
const LOCAL_PARTICIPANT_UID = testParticipantUid('participant1', 0xd4);

/** The topology a participant generates for alice on {@link LOCAL_PARTICIPANT_UID}, or a variant of it. */
const topologyFor = (input: Partial<OnboardingTopologyInput> = {}): ReturnType<typeof generatedTopologyAnswer> =>
  generatedTopologyAnswer({
    partyId: PARTY_ID,
    publicKeyDerBase64: PUBLIC_KEY_DER.toString('base64'),
    participants: [{ participantUid: LOCAL_PARTICIPANT_UID }],
    ...input,
  });
const TOPOLOGY = topologyFor();

const createMockLedgerClient = (overrides?: {
  generateExternalPartyTopologyResponse?: unknown;
  allocateExternalPartyResponse?: unknown;
}): jest.Mocked<LedgerJsonApiClient> =>
  ({
    getParticipantId: jest.fn().mockResolvedValue({ participantId: LOCAL_PARTICIPANT_UID }),
    generateExternalPartyTopology: jest
      .fn()
      .mockResolvedValue(overrides?.generateExternalPartyTopologyResponse ?? TOPOLOGY),
    allocateExternalParty: jest.fn().mockResolvedValue(
      overrides?.allocateExternalPartyResponse ?? {
        partyId: PARTY_ID,
      }
    ),
  }) as unknown as jest.Mocked<LedgerJsonApiClient>;

describe('createExternalParty', () => {
  const keypair = KEYPAIR;

  it('creates external party and returns result', async () => {
    const mockClient = createMockLedgerClient();

    const result = await createExternalParty({
      ledgerClient: mockClient,
      keypair,
      partyName: 'alice',
      synchronizerId: 'global-sync',
    });

    expect(result.partyId).toBe(PARTY_ID);
    expect(result.stellarAddress).toBe(keypair.publicKey());
    expect(result.stellarSecret).toBe(keypair.secret());
    expect(result.publicKeyFingerprint).toBe(FINGERPRINT);
  });

  it('calls generateExternalPartyTopology with correct params', async () => {
    const mockClient = createMockLedgerClient();

    await createExternalParty({
      ledgerClient: mockClient,
      keypair,
      partyName: 'alice',
      synchronizerId: 'global-sync',
    });

    expect(mockClient.generateExternalPartyTopology).toHaveBeenCalledWith({
      synchronizer: 'global-sync',
      partyHint: 'alice',
      publicKey: {
        format: 'CRYPTO_KEY_FORMAT_DER_X509_SUBJECT_PUBLIC_KEY_INFO',
        keyData: expect.any(String) as string, // Base64-encoded DER-wrapped public key
        keySpec: 'SIGNING_KEY_SPEC_EC_CURVE25519',
      },
      localParticipantObservationOnly: undefined,
      otherConfirmingParticipantUids: undefined,
      confirmationThreshold: undefined,
      observingParticipantUids: undefined,
    });
  });

  it('calls allocateExternalParty with correct params', async () => {
    const mockClient = createMockLedgerClient();

    await createExternalParty({
      ledgerClient: mockClient,
      keypair,
      partyName: 'alice',
      synchronizerId: 'global-sync',
    });

    expect(mockClient.allocateExternalParty).toHaveBeenCalledWith({
      synchronizer: 'global-sync',
      identityProviderId: 'default',
      onboardingTransactions: TOPOLOGY.topologyTransactions.map((transaction) => ({ transaction })),
      multiHashSignatures: [
        {
          format: 'SIGNATURE_FORMAT_RAW',
          signature: expect.any(String) as string, // Base64-encoded signature
          signedBy: FINGERPRINT,
          signingAlgorithmSpec: 'SIGNING_ALGORITHM_SPEC_ED25519',
        },
      ],
    });
  });

  it('forwards userId so the participant user gets act-as rights', async () => {
    const mockClient = createMockLedgerClient();

    await createExternalParty({
      ledgerClient: mockClient,
      keypair,
      partyName: 'alice',
      synchronizerId: 'global-sync',
      userId: 'wallet-server',
    });

    expect(mockClient.allocateExternalParty).toHaveBeenCalledWith(expect.objectContaining({ userId: 'wallet-server' }));
  });

  it('rejects an invalid userId before generating topology', async () => {
    const mockClient = createMockLedgerClient();

    await expect(
      createExternalParty({
        ledgerClient: mockClient,
        keypair,
        partyName: 'alice',
        synchronizerId: 'global-sync',
        userId: 'wallet server',
      })
    ).rejects.toThrow('userId may contain only');
    expect(mockClient.generateExternalPartyTopology).not.toHaveBeenCalled();
    expect(mockClient.allocateExternalParty).not.toHaveBeenCalled();
  });

  it('uses custom identityProviderId when provided', async () => {
    const mockClient = createMockLedgerClient();

    await createExternalParty({
      ledgerClient: mockClient,
      keypair,
      partyName: 'alice',
      synchronizerId: 'global-sync',
      identityProviderId: 'custom-provider',
    });

    expect(mockClient.allocateExternalParty).toHaveBeenCalledWith(
      expect.objectContaining({
        identityProviderId: 'custom-provider',
      })
    );
  });

  it('passes optional multi-hosting parameters and checks the topology hosts the party so', async () => {
    const confirming = [testParticipantUid('participant2', 0x02), testParticipantUid('participant3', 0x03)];
    const observer = testParticipantUid('observer1', 0x04);
    const mockClient = createMockLedgerClient({
      generateExternalPartyTopologyResponse: topologyFor({
        participants: [
          { participantUid: LOCAL_PARTICIPANT_UID, permission: PERMISSION.OBSERVATION },
          ...confirming.map((participantUid) => ({ participantUid })),
          { participantUid: observer, permission: PERMISSION.OBSERVATION },
        ],
        threshold: 2,
      }),
    });

    await createExternalParty({
      ledgerClient: mockClient,
      keypair,
      partyName: 'alice',
      synchronizerId: 'global-sync',
      localParticipantObservationOnly: true,
      otherConfirmingParticipantUids: confirming,
      confirmationThreshold: 2,
      observingParticipantUids: [observer],
    });

    expect(mockClient.generateExternalPartyTopology).toHaveBeenCalledWith(
      expect.objectContaining({
        localParticipantObservationOnly: true,
        otherConfirmingParticipantUids: confirming,
        confirmationThreshold: 2,
        observingParticipantUids: [observer],
      })
    );
    expect(mockClient.allocateExternalParty).toHaveBeenCalledTimes(1);
  });

  it('returns hex-encoded public key', async () => {
    const mockClient = createMockLedgerClient();

    const result = await createExternalParty({
      ledgerClient: mockClient,
      keypair,
      partyName: 'alice',
      synchronizerId: 'global-sync',
    });

    // Public key should be hex-encoded (64 characters for 32 bytes)
    expect(result.publicKey.length).toBe(64);
    expect(/^[0-9a-f]+$/.test(result.publicKey)).toBe(true);
  });

  it('throws when no party ID returned from topology generation', async () => {
    const mockClient = createMockLedgerClient({
      generateExternalPartyTopologyResponse: {
        ...TOPOLOGY,
        partyId: null,
      },
    });

    await expect(
      createExternalParty({
        ledgerClient: mockClient,
        keypair,
        partyName: 'alice',
        synchronizerId: 'global-sync',
      })
    ).rejects.toThrow('No party ID returned from topology generation');
  });

  it('throws when no multi-hash returned', async () => {
    const mockClient = createMockLedgerClient({
      generateExternalPartyTopologyResponse: {
        ...TOPOLOGY,
        multiHash: null,
      },
    });

    await expect(
      createExternalParty({
        ledgerClient: mockClient,
        keypair,
        partyName: 'alice',
        synchronizerId: 'global-sync',
      })
    ).rejects.toThrow('No multi-hash returned from topology generation');
  });

  it('throws when no topology transactions returned', async () => {
    const mockClient = createMockLedgerClient({
      generateExternalPartyTopologyResponse: {
        ...TOPOLOGY,
        topologyTransactions: [],
      },
    });

    await expect(
      createExternalParty({
        ledgerClient: mockClient,
        keypair,
        partyName: 'alice',
        synchronizerId: 'global-sync',
      })
    ).rejects.toThrow('No topology transactions returned from topology generation');
  });

  it('throws when allocation fails', async () => {
    const mockClient = createMockLedgerClient({
      allocateExternalPartyResponse: {
        partyId: null,
      },
    });

    await expect(
      createExternalParty({
        ledgerClient: mockClient,
        keypair,
        partyName: 'alice',
        synchronizerId: 'global-sync',
      })
    ).rejects.toThrow('Failed to allocate external party - no party ID returned');
  });

  it('signs multi-hash with keypair', async () => {
    const mockClient = createMockLedgerClient();

    await createExternalParty({
      ledgerClient: mockClient,
      keypair,
      partyName: 'alice',
      synchronizerId: 'global-sync',
    });

    // Verify signature is passed to allocateExternalParty
    const allocateCall = mockClient.allocateExternalParty.mock.calls[0]?.[0];
    const signatures = allocateCall?.multiHashSignatures;
    expect(signatures).toBeDefined();
    expect(signatures?.length).toBeGreaterThan(0);

    const signature = signatures?.[0]?.signature;
    expect(signature).toBeDefined();
    // Signature should be base64-encoded
    expect(typeof signature).toBe('string');
    expect(Buffer.from(signature as string, 'base64').length).toBe(64); // Ed25519 signature is 64 bytes
  });

  it("signs the multi-hash recomputed from the transactions, decoded from the participant's base64", async () => {
    const mockClient = createMockLedgerClient();

    await createExternalParty({ ledgerClient: mockClient, keypair, partyName: 'alice', synchronizerId: 'global-sync' });

    const signature = mockClient.allocateExternalParty.mock.calls[0]?.[0]?.multiHashSignatures?.[0]?.signature ?? '';
    const publicKey = { key: PUBLIC_KEY_DER, format: 'der', type: 'spki' } as const;
    expect(verify(null, Buffer.from(TOPOLOGY.multiHashHex, 'hex'), publicKey, Buffer.from(signature, 'base64'))).toBe(
      true
    );
  });

  it.each<readonly [string, unknown, string]>([
    [
      'a multi-hash that is not the hash of its transactions',
      { ...TOPOLOGY, multiHash: topologyFor({ threshold: 1, protoVersion: 30 }).multiHash },
      'HASH_MISMATCH',
    ],
    [
      'a topology on another participant',
      topologyFor({ participants: [{ participantUid: testParticipantUid('participant2', 0x02) }] }),
      'UNEXPECTED',
    ],
    [
      'a topology for another key',
      topologyFor({
        publicKeyDerBase64: Buffer.concat([
          Buffer.from('302a300506032b6570032100', 'hex'),
          Keypair.random().rawPublicKey(),
        ]).toString('base64'),
      }),
      'UNEXPECTED',
    ],
  ])('refuses %s without signing or allocating', async (_name, answer, code) => {
    const mockClient = createMockLedgerClient({ generateExternalPartyTopologyResponse: answer });

    const result = createExternalParty({
      ledgerClient: mockClient,
      keypair,
      partyName: 'alice',
      synchronizerId: 'global-sync',
    });

    await expect(result).rejects.toBeInstanceOf(OperationError);
    await expect(result).rejects.toMatchObject({
      code: 'TRANSACTION_FAILED',
      context: expect.objectContaining({ code }) as object,
    });
    expect(mockClient.allocateExternalParty).not.toHaveBeenCalled();
  });

  it("refuses a party ID that is not the keypair's", async () => {
    const mockClient = createMockLedgerClient({
      generateExternalPartyTopologyResponse: { ...TOPOLOGY, partyId: `alice::1220${'ab'.repeat(32)}` },
    });

    await expect(
      createExternalParty({ ledgerClient: mockClient, keypair, partyName: 'alice', synchronizerId: 'global-sync' })
    ).rejects.toThrow('Topology generation returned a party ID that does not match the keypair');
    expect(mockClient.allocateExternalParty).not.toHaveBeenCalled();
  });

  it('refuses invalid hosting options before reading the participant or generating topology', async () => {
    const mockClient = createMockLedgerClient();

    await expect(
      createExternalParty({
        ledgerClient: mockClient,
        keypair,
        partyName: 'alice',
        synchronizerId: 'global-sync',
        otherConfirmingParticipantUids: ['participant1'],
      })
    ).rejects.toThrow('must be a participant unique identifier');
    expect(mockClient.getParticipantId).not.toHaveBeenCalled();
    expect(mockClient.generateExternalPartyTopology).not.toHaveBeenCalled();
  });
});
