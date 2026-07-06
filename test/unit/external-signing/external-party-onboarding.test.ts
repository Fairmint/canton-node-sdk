import { generateKeyPairSync, sign } from 'node:crypto';
import type { LedgerJsonApiClient } from '../../../src/clients/ledger-json-api';
import { ApiError } from '../../../src/core/errors';
import {
  buildExternalPartyId,
  deriveCantonEd25519PublicKeyFingerprint,
  normalizeEd25519PublicKeyForCanton,
} from '../../../src/utils/external-signing/canton-protocol';
import {
  CANTON_DER_X509_PUBLIC_KEY_FORMAT,
  CANTON_EC_CURVE25519_PUBLIC_KEY_SPEC,
  CANTON_ED25519_SIGNATURE_ALGORITHM,
  CANTON_RAW_SIGNATURE_FORMAT,
  createExternalPartyWithSigner,
  getExternalPartyIdForHintAndPublicKey,
  listExternalPartyIdsForPublicKey,
  prepareExternalPartyOnboarding,
  submitExternalPartyOnboarding,
} from '../../../src/utils/external-signing/external-party-onboarding';

const MULTI_HASH_HEX = `1220${'11'.repeat(32)}`;

const createSigningFixture = (): {
  readonly publicKeyBase64: string;
  readonly publicKeyFingerprint: string;
  readonly partyId: string;
  readonly signMultiHash: () => string;
  readonly signMultiHashHex: () => string;
} => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const publicKeyBase64 = Buffer.from(publicKey.export({ format: 'der', type: 'spki' }))
    .subarray(-32)
    .toString('base64');
  const publicKeyFingerprint = deriveCantonEd25519PublicKeyFingerprint(publicKeyBase64);
  return {
    publicKeyBase64,
    publicKeyFingerprint,
    partyId: buildExternalPartyId('privy-test', publicKeyFingerprint),
    signMultiHash: () => sign(null, Buffer.from(MULTI_HASH_HEX, 'hex'), privateKey).toString('base64'),
    signMultiHashHex: () => sign(null, Buffer.from(MULTI_HASH_HEX, 'hex'), privateKey).toString('hex'),
  };
};

const createMockLedgerClient = (fixture = createSigningFixture()): jest.Mocked<LedgerJsonApiClient> => {
  const ledgerClient = Object.create(null) as jest.Mocked<LedgerJsonApiClient>;
  ledgerClient.generateExternalPartyTopology = jest.fn().mockResolvedValue({
    partyId: fixture.partyId,
    multiHash: Buffer.from(MULTI_HASH_HEX, 'hex').toString('base64'),
    topologyTransactions: ['topology-tx-1', 'topology-tx-2'],
  });
  ledgerClient.allocateExternalParty = jest.fn().mockResolvedValue({
    partyId: fixture.partyId,
  });
  ledgerClient.getPartyDetails = jest.fn().mockResolvedValue({
    partyDetails: {
      party: fixture.partyId,
      isLocal: true,
    },
  });
  ledgerClient.listParties = jest.fn().mockResolvedValue({
    partyDetails: [
      { party: fixture.partyId },
      { party: buildExternalPartyId('another-prefix', fixture.publicKeyFingerprint) },
      { party: `other::1220${'aa'.repeat(32)}` },
      { party: fixture.partyId },
    ],
  });
  return ledgerClient;
};

describe('external-party onboarding helpers', () => {
  it('prepares topology with normalized Canton public key metadata', async () => {
    const fixture = createSigningFixture();
    const ledgerClient = createMockLedgerClient(fixture);

    const prepared = await prepareExternalPartyOnboarding({
      ledgerClient,
      synchronizerId: 'global-domain::sync',
      partyHint: 'privy-test',
      publicKeyBase64: fixture.publicKeyBase64,
    });

    expect(ledgerClient.generateExternalPartyTopology).toHaveBeenCalledWith({
      synchronizer: 'global-domain::sync',
      partyHint: 'privy-test',
      publicKey: {
        format: CANTON_DER_X509_PUBLIC_KEY_FORMAT,
        keyData: normalizeEd25519PublicKeyForCanton(fixture.publicKeyBase64),
        keySpec: CANTON_EC_CURVE25519_PUBLIC_KEY_SPEC,
      },
      localParticipantObservationOnly: false,
      otherConfirmingParticipantUids: undefined,
      confirmationThreshold: undefined,
      observingParticipantUids: undefined,
    });
    expect(prepared).toMatchObject({
      partyId: fixture.partyId,
      publicKeyFingerprint: fixture.publicKeyFingerprint,
      multiHashHex: MULTI_HASH_HEX,
      synchronizerId: 'global-domain::sync',
      topologyTransactions: ['topology-tx-1', 'topology-tx-2'],
      publicKeyFormat: CANTON_DER_X509_PUBLIC_KEY_FORMAT,
      signingAlgorithmSpec: CANTON_ED25519_SIGNATURE_ALGORITHM,
    });
  });

  it('rejects topology responses whose party id does not match the submitted public key', async () => {
    const fixture = createSigningFixture();
    const ledgerClient = createMockLedgerClient(fixture);
    ledgerClient.generateExternalPartyTopology.mockResolvedValueOnce({
      partyId: `wrong::1220${'aa'.repeat(32)}`,
      multiHash: MULTI_HASH_HEX,
      topologyTransactions: ['topology-tx'],
    });

    await expect(
      prepareExternalPartyOnboarding({
        ledgerClient,
        synchronizerId: 'global-domain::sync',
        partyHint: 'wrong',
        publicKeyBase64: fixture.publicKeyBase64,
      })
    ).rejects.toThrow('party ID matching the submitted public key');
  });

  it('verifies the end-user signature before allocating the external party', async () => {
    const fixture = createSigningFixture();
    const ledgerClient = createMockLedgerClient(fixture);

    const submitted = await submitExternalPartyOnboarding({
      ledgerClient,
      synchronizerId: 'global-domain::sync',
      partyId: fixture.partyId,
      publicKeyBase64: fixture.publicKeyBase64,
      publicKeyFingerprint: fixture.publicKeyFingerprint,
      multiHashHex: MULTI_HASH_HEX,
      topologyTransactions: ['topology-tx-1', 'topology-tx-2'],
      multiHashSignatureBase64: fixture.signMultiHash(),
    });

    expect(ledgerClient.allocateExternalParty).toHaveBeenCalledWith({
      synchronizer: 'global-domain::sync',
      identityProviderId: '',
      onboardingTransactions: [{ transaction: 'topology-tx-1' }, { transaction: 'topology-tx-2' }],
      multiHashSignatures: [
        {
          format: CANTON_RAW_SIGNATURE_FORMAT,
          signature: expect.any(String) as string,
          signedBy: fixture.publicKeyFingerprint,
          signingAlgorithmSpec: CANTON_ED25519_SIGNATURE_ALGORITHM,
        },
      ],
    });
    expect(submitted).toEqual({
      partyId: fixture.partyId,
      raw: { partyId: fixture.partyId },
      alreadyExisted: false,
    });
  });

  it('creates an external party with an external signer callback returning hex', async () => {
    const fixture = createSigningFixture();
    const ledgerClient = createMockLedgerClient(fixture);
    const signMultiHash = jest.fn(() => ({ signatureHex: fixture.signMultiHashHex() }));

    const created = await createExternalPartyWithSigner({
      ledgerClient,
      synchronizerId: 'global-domain::sync',
      partyHint: 'privy-test',
      publicKeyBase64: fixture.publicKeyBase64,
      identityProviderId: 'custom-idp',
      signMultiHash,
    });

    expect(signMultiHash).toHaveBeenCalledWith({
      partyHint: 'privy-test',
      partyId: fixture.partyId,
      publicKeyBase64: normalizeEd25519PublicKeyForCanton(fixture.publicKeyBase64),
      publicKeyFingerprint: fixture.publicKeyFingerprint,
      synchronizerId: 'global-domain::sync',
      multiHashHex: MULTI_HASH_HEX,
      multiHashBase64: Buffer.from(MULTI_HASH_HEX, 'hex').toString('base64'),
      topologyTransactions: ['topology-tx-1', 'topology-tx-2'],
      signingAlgorithmSpec: CANTON_ED25519_SIGNATURE_ALGORITHM,
    });
    expect(ledgerClient.allocateExternalParty).toHaveBeenCalledWith({
      synchronizer: 'global-domain::sync',
      identityProviderId: 'custom-idp',
      onboardingTransactions: [{ transaction: 'topology-tx-1' }, { transaction: 'topology-tx-2' }],
      multiHashSignatures: [
        {
          format: CANTON_RAW_SIGNATURE_FORMAT,
          signature: fixture.signMultiHash(),
          signedBy: fixture.publicKeyFingerprint,
          signingAlgorithmSpec: CANTON_ED25519_SIGNATURE_ALGORITHM,
        },
      ],
    });
    expect(created).toMatchObject({
      partyId: fixture.partyId,
      publicKeyFingerprint: fixture.publicKeyFingerprint,
      publicKeyBase64: normalizeEd25519PublicKeyForCanton(fixture.publicKeyBase64),
      synchronizerId: 'global-domain::sync',
      alreadyExisted: false,
    });
  });

  it('forwards multi-hosting options through external signer party creation', async () => {
    const fixture = createSigningFixture();
    const ledgerClient = createMockLedgerClient(fixture);

    await createExternalPartyWithSigner({
      ledgerClient,
      synchronizerId: 'global-domain::sync',
      partyHint: 'privy-test',
      publicKeyBase64: fixture.publicKeyBase64,
      localParticipantObservationOnly: true,
      otherConfirmingParticipantUids: ['participant-1'],
      confirmationThreshold: 1,
      observingParticipantUids: ['observer-1'],
      signMultiHash: () => ({ signatureBase64: fixture.signMultiHash() }),
    });

    expect(ledgerClient.generateExternalPartyTopology).toHaveBeenCalledWith(
      expect.objectContaining({
        localParticipantObservationOnly: true,
        otherConfirmingParticipantUids: ['participant-1'],
        confirmationThreshold: 1,
        observingParticipantUids: ['observer-1'],
      })
    );
  });

  it('rejects invalid external signer output before allocating', async () => {
    const fixture = createSigningFixture();
    const ledgerClient = createMockLedgerClient(fixture);

    await expect(
      createExternalPartyWithSigner({
        ledgerClient,
        synchronizerId: 'global-domain::sync',
        partyHint: 'privy-test',
        publicKeyBase64: fixture.publicKeyBase64,
        signMultiHash: () => ({ signatureHex: 'deadbeef' }),
      })
    ).rejects.toThrow('External-party signer must return a 64-byte Ed25519 signature');

    expect(ledgerClient.allocateExternalParty).not.toHaveBeenCalled();
  });

  it('does not allocate when the submitted multi-hash signature is invalid', async () => {
    const fixture = createSigningFixture();
    const otherFixture = createSigningFixture();
    const ledgerClient = createMockLedgerClient(fixture);

    await expect(
      submitExternalPartyOnboarding({
        ledgerClient,
        synchronizerId: 'global-domain::sync',
        partyId: fixture.partyId,
        publicKeyBase64: fixture.publicKeyBase64,
        multiHashHex: MULTI_HASH_HEX,
        topologyTransactions: ['topology-tx-1'],
        multiHashSignatureBase64: otherFixture.signMultiHash(),
      })
    ).rejects.toThrow('Invalid Canton hash signature');

    expect(ledgerClient.allocateExternalParty).not.toHaveBeenCalled();
  });

  it('can treat allocation conflict as success after confirming the party exists', async () => {
    const fixture = createSigningFixture();
    const ledgerClient = createMockLedgerClient(fixture);
    ledgerClient.allocateExternalParty.mockRejectedValueOnce(new ApiError('already exists', 409));

    const submitted = await submitExternalPartyOnboarding({
      ledgerClient,
      synchronizerId: 'global-domain::sync',
      partyId: fixture.partyId,
      publicKeyBase64: fixture.publicKeyBase64,
      multiHashHex: MULTI_HASH_HEX,
      topologyTransactions: ['topology-tx-1'],
      multiHashSignatureBase64: fixture.signMultiHash(),
      identityProviderId: 'custom-idp',
      allowAlreadyExists: true,
    });

    expect(ledgerClient.getPartyDetails).toHaveBeenCalledWith({
      party: fixture.partyId,
      identityProviderId: 'custom-idp',
    });
    expect(submitted.alreadyExisted).toBe(true);
    expect(submitted.partyId).toBe(fixture.partyId);
  });

  it('lists and checks existing external parties by public-key fingerprint', async () => {
    const fixture = createSigningFixture();
    const ledgerClient = createMockLedgerClient(fixture);

    await expect(listExternalPartyIdsForPublicKey(ledgerClient, fixture.publicKeyBase64)).resolves.toMatchObject({
      publicKeyFingerprint: fixture.publicKeyFingerprint,
      parties: [buildExternalPartyId('another-prefix', fixture.publicKeyFingerprint), fixture.partyId],
    });

    await expect(
      getExternalPartyIdForHintAndPublicKey(ledgerClient, 'privy-test', fixture.publicKeyBase64)
    ).resolves.toMatchObject({
      publicKeyFingerprint: fixture.publicKeyFingerprint,
      partyId: fixture.partyId,
      exists: true,
    });

    ledgerClient.getPartyDetails.mockRejectedValueOnce(new ApiError('not found', 404));
    await expect(
      getExternalPartyIdForHintAndPublicKey(ledgerClient, 'privy-test', fixture.publicKeyBase64)
    ).resolves.toMatchObject({
      partyId: fixture.partyId,
      exists: false,
      raw: null,
    });
  });
});
