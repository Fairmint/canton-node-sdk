import {
  buildExternalPartyId,
  fingerprintEd25519PublicKey,
  normalizeEd25519PublicKeyForCanton,
} from '@fairmint/canton-protocol/party';
import { generateKeyPairSync, sign } from 'node:crypto';
import type { LedgerJsonApiClient } from '../../../src/clients/ledger-json-api';
import { ApiError, ValidationError } from '../../../src/core/errors';

import {
  CANTON_DER_X509_PUBLIC_KEY_FORMAT,
  CANTON_EC_CURVE25519_PUBLIC_KEY_SPEC,
  CANTON_ED25519_SIGNATURE_ALGORITHM,
  CANTON_RAW_SIGNATURE_FORMAT,
  createExternalPartyWithSigner,
  type ExternalPartyConflictReconciliationError,
  getExternalPartyIdForHintAndPublicKey,
  listExternalPartyIdsForPublicKey,
  prepareExternalPartyOnboarding,
  submitExternalPartyOnboarding,
} from '../../../src/utils/external-signing/external-party-onboarding';
import { expectSignatureRefused, REFUSED_SIGNATURES } from './fixtures/hash-signatures';

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
  const publicKeyFingerprint = fingerprintEd25519PublicKey(publicKeyBase64);
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

const nonCanonicalSpellings = (signatureBase64: string): ReadonlyArray<readonly [string, string]> => [
  ['unpadded', signatureBase64.replace(/=+$/, '')],
  ['base64url', signatureBase64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')],
  ['whitespace-padded', ` ${signatureBase64}\n`],
];

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
      publicKeyFingerprint: `1220${'aa'.repeat(32)}`,
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

  it('forwards allocation cancellation without changing the submitted topology', async () => {
    const fixture = createSigningFixture();
    const ledgerClient = createMockLedgerClient(fixture);
    const controller = new AbortController();

    await submitExternalPartyOnboarding({
      ledgerClient,
      synchronizerId: 'global-domain::sync',
      partyId: fixture.partyId,
      publicKeyBase64: fixture.publicKeyBase64,
      publicKeyFingerprint: fixture.publicKeyFingerprint,
      multiHashHex: MULTI_HASH_HEX,
      topologyTransactions: ['topology-tx-1'],
      multiHashSignatureBase64: fixture.signMultiHash(),
      signal: controller.signal,
    });

    expect(ledgerClient.allocateExternalParty).toHaveBeenCalledWith(
      expect.objectContaining({
        synchronizer: 'global-domain::sync',
        onboardingTransactions: [{ transaction: 'topology-tx-1' }],
      }),
      { signal: controller.signal }
    );
  });

  it('grants the trimmed userId act-as rights through allocation', async () => {
    const fixture = createSigningFixture();
    const ledgerClient = createMockLedgerClient(fixture);

    await submitExternalPartyOnboarding({
      ledgerClient,
      synchronizerId: 'global-domain::sync',
      partyId: fixture.partyId,
      publicKeyBase64: fixture.publicKeyBase64,
      publicKeyFingerprint: fixture.publicKeyFingerprint,
      multiHashHex: MULTI_HASH_HEX,
      topologyTransactions: ['topology-tx-1'],
      multiHashSignatureBase64: fixture.signMultiHash(),
      userId: '  wallet-server ',
    });

    expect(ledgerClient.allocateExternalParty).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'wallet-server' })
    );
  });

  it.each([
    ['', 'userId must not be empty'],
    ['u'.repeat(129), 'userId must be at most 128 characters'],
    ['user\nname', 'userId may contain only'],
  ])('rejects an invalid userId %j before allocating', async (userId, message) => {
    const fixture = createSigningFixture();
    const ledgerClient = createMockLedgerClient(fixture);

    await expect(
      submitExternalPartyOnboarding({
        ledgerClient,
        synchronizerId: 'global-domain::sync',
        partyId: fixture.partyId,
        publicKeyBase64: fixture.publicKeyBase64,
        multiHashHex: MULTI_HASH_HEX,
        topologyTransactions: ['topology-tx-1'],
        multiHashSignatureBase64: fixture.signMultiHash(),
        userId,
      })
    ).rejects.toThrow(message);
    expect(ledgerClient.allocateExternalParty).not.toHaveBeenCalled();
  });

  it.each([
    ['', 'userId must not be empty'],
    ['u'.repeat(129), 'userId must be at most 128 characters'],
    ['wallet server', 'userId may contain only'],
  ])('rejects an invalid userId %j before preparing or signing', async (userId, message) => {
    const fixture = createSigningFixture();
    const ledgerClient = createMockLedgerClient(fixture);
    const signMultiHash = jest.fn(() => ({ signatureBase64: fixture.signMultiHash() }));

    const result = createExternalPartyWithSigner({
      ledgerClient,
      synchronizerId: 'global-domain::sync',
      partyHint: 'privy-test',
      publicKeyBase64: fixture.publicKeyBase64,
      userId,
      signMultiHash,
    });

    await expect(result).rejects.toBeInstanceOf(ValidationError);
    await expect(result).rejects.toThrow(message);
    expect(signMultiHash).not.toHaveBeenCalled();
    expect(ledgerClient.generateExternalPartyTopology).not.toHaveBeenCalled();
    expect(ledgerClient.allocateExternalParty).not.toHaveBeenCalled();
  });

  it('sends a verified multihash signature to the allocation as canonical padded base64', async () => {
    const fixture = createSigningFixture();
    const canonical = fixture.signMultiHash();
    for (const [, spelling] of nonCanonicalSpellings(canonical)) {
      const ledgerClient = createMockLedgerClient(fixture);
      ledgerClient.allocateExternalParty.mockResolvedValueOnce({ partyId: fixture.partyId });

      await submitExternalPartyOnboarding({
        ledgerClient,
        synchronizerId: 'global-domain::sync',
        partyId: fixture.partyId,
        publicKeyBase64: fixture.publicKeyBase64,
        multiHashHex: MULTI_HASH_HEX,
        topologyTransactions: ['topology-tx-1'],
        multiHashSignatureBase64: spelling,
      });

      expect(ledgerClient.allocateExternalParty).toHaveBeenCalledWith(
        expect.objectContaining({
          multiHashSignatures: [expect.objectContaining({ signature: canonical }) as object],
        })
      );
    }
  });

  it('grants CanActAs to userId when allowAlreadyExists confirms an existing party', async () => {
    const fixture = createSigningFixture();
    const ledgerClient = createMockLedgerClient(fixture);
    const controller = new AbortController();
    ledgerClient.allocateExternalParty.mockRejectedValueOnce(new ApiError('already exists', 409));
    ledgerClient.listUserRights = jest.fn().mockResolvedValue({ rights: [] });
    ledgerClient.grantUserRights = jest.fn().mockResolvedValue({ newlyGrantedRights: [] });

    const submitted = await submitExternalPartyOnboarding({
      ledgerClient,
      synchronizerId: 'global-domain::sync',
      partyId: fixture.partyId,
      publicKeyBase64: fixture.publicKeyBase64,
      multiHashHex: MULTI_HASH_HEX,
      topologyTransactions: ['topology-tx-1'],
      multiHashSignatureBase64: fixture.signMultiHash(),
      userId: ' wallet-server ',
      allowAlreadyExists: true,
      signal: controller.signal,
    });

    expect(submitted.alreadyExisted).toBe(true);
    expect(ledgerClient.listUserRights).toHaveBeenCalledWith(
      { userId: 'wallet-server', identityProviderId: '' },
      { signal: controller.signal }
    );
    expect(ledgerClient.grantUserRights).toHaveBeenCalledWith(
      {
        userId: 'wallet-server',
        identityProviderId: '',
        rights: [{ kind: { CanActAs: { value: { party: fixture.partyId } } } }],
      },
      { signal: controller.signal }
    );
  });

  const replayOptions = (
    fixture: ReturnType<typeof createSigningFixture>,
    ledgerClient: jest.Mocked<LedgerJsonApiClient>,
    extra: { identityProviderId?: string } = {}
  ): Parameters<typeof submitExternalPartyOnboarding>[0] => ({
    ledgerClient,
    synchronizerId: 'global-domain::sync',
    partyId: fixture.partyId,
    publicKeyBase64: fixture.publicKeyBase64,
    multiHashHex: MULTI_HASH_HEX,
    topologyTransactions: ['topology-tx-1'],
    multiHashSignatureBase64: fixture.signMultiHash(),
    userId: 'wallet-server',
    allowAlreadyExists: true,
    ...extra,
  });

  it('skips the administrative grant on a replay when the user already holds CanActAs', async () => {
    const fixture = createSigningFixture();
    const ledgerClient = createMockLedgerClient(fixture);
    ledgerClient.allocateExternalParty.mockRejectedValueOnce(new ApiError('already exists', 409));
    ledgerClient.listUserRights = jest.fn().mockResolvedValue({
      rights: [
        { kind: { CanReadAs: { value: { party: fixture.partyId } } } },
        { kind: { CanActAs: { value: { party: fixture.partyId } } } },
      ],
    });
    // An ordinary participant user may not grant rights: the replay must not need to.
    ledgerClient.grantUserRights = jest.fn().mockRejectedValue(new ApiError('permission denied', 403));

    const submitted = await submitExternalPartyOnboarding(replayOptions(fixture, ledgerClient));

    expect(submitted.alreadyExisted).toBe(true);
    expect(ledgerClient.grantUserRights).not.toHaveBeenCalled();
  });

  it('reports clearly when the user lacks CanActAs and the caller may not grant it', async () => {
    const fixture = createSigningFixture();
    const ledgerClient = createMockLedgerClient(fixture);
    ledgerClient.allocateExternalParty.mockRejectedValueOnce(new ApiError('already exists', 409));
    ledgerClient.listUserRights = jest.fn().mockResolvedValue({
      rights: [{ kind: { CanActAs: { value: { party: 'someone-else::1220' } } } }],
    });
    ledgerClient.grantUserRights = jest.fn().mockRejectedValue(new ApiError('permission denied', 403));

    await expect(submitExternalPartyOnboarding(replayOptions(fixture, ledgerClient))).rejects.toMatchObject({
      name: 'OperationError',
      message: expect.stringContaining('does not hold CanActAs on it') as string,
      context: expect.objectContaining({ userId: 'wallet-server', partyId: fixture.partyId }) as object,
    });
  });

  it('reports clearly when the caller may not read the user rights', async () => {
    const fixture = createSigningFixture();
    const ledgerClient = createMockLedgerClient(fixture);
    ledgerClient.allocateExternalParty.mockRejectedValueOnce(new ApiError('already exists', 409));
    ledgerClient.listUserRights = jest.fn().mockRejectedValue(new ApiError('permission denied', 403));
    ledgerClient.grantUserRights = jest.fn();

    await expect(submitExternalPartyOnboarding(replayOptions(fixture, ledgerClient))).rejects.toMatchObject({
      name: 'OperationError',
      message: expect.stringContaining('cannot confirm that user can act as the party') as string,
    });
    expect(ledgerClient.grantUserRights).not.toHaveBeenCalled();
  });

  it('propagates other grant failures unchanged', async () => {
    const fixture = createSigningFixture();
    const ledgerClient = createMockLedgerClient(fixture);
    const failure = new ApiError('unavailable', 503);
    ledgerClient.allocateExternalParty.mockRejectedValueOnce(new ApiError('already exists', 409));
    ledgerClient.listUserRights = jest.fn().mockResolvedValue({ rights: [] });
    ledgerClient.grantUserRights = jest.fn().mockRejectedValue(failure);

    await expect(submitExternalPartyOnboarding(replayOptions(fixture, ledgerClient))).rejects.toBe(failure);
  });

  it('reads and grants rights under the custom identity provider used for allocation', async () => {
    const fixture = createSigningFixture();
    const ledgerClient = createMockLedgerClient(fixture);
    ledgerClient.allocateExternalParty.mockRejectedValueOnce(new ApiError('already exists', 409));
    ledgerClient.listUserRights = jest.fn().mockResolvedValue({ rights: [] });
    ledgerClient.grantUserRights = jest.fn().mockResolvedValue({ newlyGrantedRights: [] });

    await submitExternalPartyOnboarding(replayOptions(fixture, ledgerClient, { identityProviderId: 'idp-wallets' }));

    expect(ledgerClient.listUserRights).toHaveBeenCalledWith({
      userId: 'wallet-server',
      identityProviderId: 'idp-wallets',
    });
    expect(ledgerClient.grantUserRights).toHaveBeenCalledWith({
      userId: 'wallet-server',
      identityProviderId: 'idp-wallets',
      rights: [{ kind: { CanActAs: { value: { party: fixture.partyId } } } }],
    });
  });

  it('does not grant user rights separately when the allocation itself succeeds', async () => {
    const fixture = createSigningFixture();
    const ledgerClient = createMockLedgerClient(fixture);
    ledgerClient.grantUserRights = jest.fn();

    await submitExternalPartyOnboarding({
      ledgerClient,
      synchronizerId: 'global-domain::sync',
      partyId: fixture.partyId,
      publicKeyBase64: fixture.publicKeyBase64,
      multiHashHex: MULTI_HASH_HEX,
      topologyTransactions: ['topology-tx-1'],
      multiHashSignatureBase64: fixture.signMultiHash(),
      userId: 'wallet-server',
      allowAlreadyExists: true,
    });

    expect(ledgerClient.grantUserRights).not.toHaveBeenCalled();
  });

  it('forwards userId through external signer party creation', async () => {
    const fixture = createSigningFixture();
    const ledgerClient = createMockLedgerClient(fixture);

    await createExternalPartyWithSigner({
      ledgerClient,
      synchronizerId: 'global-domain::sync',
      partyHint: 'privy-test',
      publicKeyBase64: fixture.publicKeyBase64,
      userId: 'wallet-server',
      signMultiHash: () => ({ signatureBase64: fixture.signMultiHash() }),
    });

    expect(ledgerClient.allocateExternalParty).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'wallet-server' })
    );
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
    ).rejects.toMatchObject({
      message: 'External-party signer must return a 64-byte Ed25519 signature',
      context: { actualLength: 4, expectedLength: 64 },
    });

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

  it.each(REFUSED_SIGNATURES)('does not allocate when the multi-hash signature is $name', async (refusal) => {
    const fixture = createSigningFixture();
    const ledgerClient = createMockLedgerClient(fixture);

    await expectSignatureRefused(
      submitExternalPartyOnboarding({
        ledgerClient,
        synchronizerId: 'global-domain::sync',
        partyId: fixture.partyId,
        publicKeyBase64: fixture.publicKeyBase64,
        multiHashHex: MULTI_HASH_HEX,
        topologyTransactions: ['topology-tx-1'],
        multiHashSignatureBase64: refusal.make({
          valid: fixture.signMultiHash(),
          otherKey: createSigningFixture().signMultiHash(),
        }),
      }),
      refusal
    );

    expect(ledgerClient.allocateExternalParty).not.toHaveBeenCalled();
  });

  it('allocates when the submitted multi-hash signature verifies', async () => {
    const fixture = createSigningFixture();
    const ledgerClient = createMockLedgerClient(fixture);

    const submitted = await submitExternalPartyOnboarding({
      ledgerClient,
      synchronizerId: 'global-domain::sync',
      partyId: fixture.partyId,
      publicKeyBase64: fixture.publicKeyBase64,
      multiHashHex: MULTI_HASH_HEX.toUpperCase(),
      topologyTransactions: ['topology-tx-1'],
      multiHashSignatureBase64: fixture.signMultiHash(),
    });

    expect(submitted.partyId).toBe(fixture.partyId);
    expect(ledgerClient.allocateExternalParty).toHaveBeenCalledTimes(1);
  });

  it('can treat allocation conflict as success after confirming the party exists', async () => {
    const fixture = createSigningFixture();
    const ledgerClient = createMockLedgerClient(fixture);
    const controller = new AbortController();
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
      signal: controller.signal,
    });

    expect(ledgerClient.getPartyDetails).toHaveBeenCalledWith(
      {
        party: fixture.partyId,
        identityProviderId: 'custom-idp',
      },
      { signal: controller.signal }
    );
    expect(submitted.alreadyExisted).toBe(true);
    expect(submitted.partyId).toBe(fixture.partyId);
  });

  it('aborts a pending allocation-conflict confirmation read', async () => {
    const fixture = createSigningFixture();
    const ledgerClient = createMockLedgerClient(fixture);
    const controller = new AbortController();
    let markConfirmationStarted: (() => void) | undefined;
    const confirmationStarted = new Promise<void>((resolve) => {
      markConfirmationStarted = resolve;
    });
    ledgerClient.allocateExternalParty.mockRejectedValueOnce(new ApiError('already exists', 409));
    ledgerClient.getPartyDetails.mockImplementationOnce(
      async () =>
        new Promise<never>(() => {
          markConfirmationStarted?.();
        })
    );

    const submitted = submitExternalPartyOnboarding({
      ledgerClient,
      synchronizerId: 'global-domain::sync',
      partyId: fixture.partyId,
      publicKeyBase64: fixture.publicKeyBase64,
      multiHashHex: MULTI_HASH_HEX,
      topologyTransactions: ['topology-tx-1'],
      multiHashSignatureBase64: fixture.signMultiHash(),
      allowAlreadyExists: true,
      signal: controller.signal,
    });

    await confirmationStarted;
    controller.abort();

    await expect(submitted).rejects.toMatchObject({
      name: 'ExternalPartyConflictReconciliationError',
      partyId: fixture.partyId,
      allocationError: { status: 409 },
      cause: { message: 'Canton external-party conflict reconciliation was aborted' },
    } satisfies Partial<ExternalPartyConflictReconciliationError>);
  });

  it('preserves a confirmation failure that settles before a later abort', async () => {
    const fixture = createSigningFixture();
    const ledgerClient = createMockLedgerClient(fixture);
    const controller = new AbortController();
    const allocationError = new ApiError('already exists', 409);
    const confirmationError = new ApiError('party details unavailable', 503);
    let rejectConfirmation: ((reason: unknown) => void) | undefined;
    let markConfirmationStarted: (() => void) | undefined;
    const confirmationStarted = new Promise<void>((resolve) => {
      markConfirmationStarted = resolve;
    });
    ledgerClient.allocateExternalParty.mockRejectedValueOnce(allocationError);
    ledgerClient.getPartyDetails.mockImplementationOnce(
      // eslint-disable-next-line @typescript-eslint/promise-function-async -- non-async arrow preserves rejection timing under abort
      () =>
        new Promise<never>((_resolve, reject) => {
          rejectConfirmation = reject;
          markConfirmationStarted?.();
        })
    );

    const submitted = submitExternalPartyOnboarding({
      ledgerClient,
      synchronizerId: 'global-domain::sync',
      partyId: fixture.partyId,
      publicKeyBase64: fixture.publicKeyBase64,
      multiHashHex: MULTI_HASH_HEX,
      topologyTransactions: ['topology-tx-1'],
      multiHashSignatureBase64: fixture.signMultiHash(),
      allowAlreadyExists: true,
      signal: controller.signal,
    });

    await confirmationStarted;
    rejectConfirmation?.(confirmationError);
    controller.abort();

    await expect(submitted).rejects.toBe(allocationError);
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
