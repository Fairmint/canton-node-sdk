import { Keypair } from '@stellar/stellar-base';
import type { LedgerJsonApiClient } from '../../../src/clients/ledger-json-api';
import { createExternalParty } from '../../../src/utils/external-signing/create-external-party';

const createMockLedgerClient = (overrides?: {
  generateExternalPartyTopologyResponse?: unknown;
  allocateExternalPartyResponse?: unknown;
}): jest.Mocked<LedgerJsonApiClient> =>
  ({
    generateExternalPartyTopology: jest.fn().mockResolvedValue(
      overrides?.generateExternalPartyTopologyResponse ?? {
        partyId: 'alice::abc123fingerprint',
        multiHash: 'deadbeef0123456789abcdef',
        topologyTransactions: ['tx1', 'tx2'],
      }
    ),
    allocateExternalParty: jest.fn().mockResolvedValue(
      overrides?.allocateExternalPartyResponse ?? {
        partyId: 'alice::abc123fingerprint',
      }
    ),
  }) as unknown as jest.Mocked<LedgerJsonApiClient>;

describe('createExternalParty', () => {
  let keypair: Keypair;

  beforeEach(() => {
    // Use a deterministic keypair for reproducible tests
    keypair = Keypair.fromSecret('SBGWSG6BTNCKCOB3DIFBGCVMUPQFYPA2G4O34RMTB343OYPXU5DJDVMN');
  });

  it('creates external party and returns result', async () => {
    const mockClient = createMockLedgerClient();

    const result = await createExternalParty({
      ledgerClient: mockClient,
      keypair,
      partyName: 'alice',
      synchronizerId: 'global-sync',
    });

    expect(result.partyId).toBe('alice::abc123fingerprint');
    expect(result.stellarAddress).toBe(keypair.publicKey());
    expect(result.stellarSecret).toBe(keypair.secret());
    expect(result.publicKeyFingerprint).toBe('abc123fingerprint');
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
      onboardingTransactions: [{ transaction: 'tx1' }, { transaction: 'tx2' }],
      multiHashSignatures: [
        {
          format: 'SIGNATURE_FORMAT_RAW',
          signature: expect.any(String) as string, // Base64-encoded signature
          signedBy: 'abc123fingerprint',
          signingAlgorithmSpec: 'SIGNING_ALGORITHM_SPEC_ED25519',
        },
      ],
    });
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

  it('passes optional multi-hosting parameters', async () => {
    const mockClient = createMockLedgerClient();

    await createExternalParty({
      ledgerClient: mockClient,
      keypair,
      partyName: 'alice',
      synchronizerId: 'global-sync',
      localParticipantObservationOnly: true,
      otherConfirmingParticipantUids: ['participant1', 'participant2'],
      confirmationThreshold: 2,
      observingParticipantUids: ['observer1'],
    });

    expect(mockClient.generateExternalPartyTopology).toHaveBeenCalledWith(
      expect.objectContaining({
        localParticipantObservationOnly: true,
        otherConfirmingParticipantUids: ['participant1', 'participant2'],
        confirmationThreshold: 2,
        observingParticipantUids: ['observer1'],
      })
    );
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
        partyId: null,
        multiHash: 'deadbeef',
        topologyTransactions: ['tx1'],
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
        partyId: 'alice::fingerprint',
        multiHash: null,
        topologyTransactions: ['tx1'],
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
        partyId: 'alice::fingerprint',
        multiHash: 'deadbeef',
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
});
