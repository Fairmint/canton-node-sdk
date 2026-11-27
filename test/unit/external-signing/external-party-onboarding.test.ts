import {
  buildExternalPartyId,
  fingerprintEd25519PublicKey,
  isCantonProtocolError,
  normalizeEd25519PublicKeyForCanton,
} from '@fairmint/canton-protocol/party';
import { generateKeyPairSync, sign } from 'node:crypto';
import type { LedgerJsonApiClient } from '../../../src/clients/ledger-json-api';
import { ApiError, OperationError, ValidationError } from '../../../src/core/errors';

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
import {
  encodeOnboardingTopology,
  generatedTopologyAnswer,
  type GeneratedTopologyAnswer,
  KEY_USAGE,
  nodeMultiHashHex,
  type OnboardingTopologyInput,
  PERMISSION,
  testParticipantUid,
} from './fixtures/topology';
import {
  GENERATED_TOPOLOGY,
  GENERATED_TOPOLOGY_PARTICIPANT_UID,
  GENERATED_TOPOLOGY_PARTY_ID,
  GENERATED_TOPOLOGY_PUBLIC_KEY,
} from './fixtures/topology-vectors';

/** The local participant every mock ledger answers `GET /v2/parties/participant-id` with. */
const LOCAL_PARTICIPANT_UID = testParticipantUid('participant1', 0xd4);
/** A multi-hash of nothing in particular, for answers refused before it is looked at. */
const UNRELATED_MULTI_HASH_HEX = `1220${'11'.repeat(32)}`;

interface SigningFixture {
  readonly publicKeyBase64: string;
  readonly publicKeyDerBase64: string;
  readonly publicKeyFingerprint: string;
  readonly partyId: string;
  /** The topology a participant generates for `partyId` hosted on {@link LOCAL_PARTICIPANT_UID} (CONFIRMATION). */
  readonly topology: GeneratedTopologyAnswer;
  readonly topologyTransactions: readonly string[];
  /** The multi-hash of `topologyTransactions`, computed independently (node:crypto), lowercase hex. */
  readonly multiHashHex: string;
  /** Builds another generated topology for this party and key. */
  readonly topologyFor: (input: Partial<OnboardingTopologyInput>) => GeneratedTopologyAnswer;
  readonly sign: (hashHex: string) => string;
  readonly signMultiHash: () => string;
  readonly signMultiHashHex: () => string;
}

const createSigningFixture = (): SigningFixture => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const publicKeyDer = Buffer.from(publicKey.export({ format: 'der', type: 'spki' }));
  const publicKeyBase64 = publicKeyDer.subarray(-32).toString('base64');
  const publicKeyFingerprint = fingerprintEd25519PublicKey(publicKeyBase64);
  const partyId = buildExternalPartyId('privy-test', publicKeyFingerprint);
  const topologyFor = (input: Partial<OnboardingTopologyInput>): GeneratedTopologyAnswer =>
    generatedTopologyAnswer({
      partyId,
      publicKeyDerBase64: publicKeyDer.toString('base64'),
      participants: [{ participantUid: LOCAL_PARTICIPANT_UID }],
      ...input,
    });
  const topology = topologyFor({});
  const signHash = (hashHex: string): Buffer => sign(null, Buffer.from(hashHex, 'hex'), privateKey);
  return {
    publicKeyBase64,
    publicKeyDerBase64: publicKeyDer.toString('base64'),
    publicKeyFingerprint,
    partyId,
    topology,
    topologyTransactions: topology.topologyTransactions,
    multiHashHex: topology.multiHashHex,
    topologyFor,
    sign: (hashHex) => signHash(hashHex).toString('base64'),
    signMultiHash: () => signHash(topology.multiHashHex).toString('base64'),
    signMultiHashHex: () => signHash(topology.multiHashHex).toString('hex'),
  };
};

const createMockLedgerClient = (fixture = createSigningFixture()): jest.Mocked<LedgerJsonApiClient> => {
  const ledgerClient = Object.create(null) as jest.Mocked<LedgerJsonApiClient>;
  ledgerClient.getParticipantId = jest.fn().mockResolvedValue({ participantId: LOCAL_PARTICIPANT_UID });
  ledgerClient.generateExternalPartyTopology = jest.fn().mockResolvedValue({
    partyId: fixture.partyId,
    multiHash: fixture.topology.multiHash,
    topologyTransactions: [...fixture.topologyTransactions],
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
      multiHashHex: fixture.multiHashHex,
      synchronizerId: 'global-domain::sync',
      topologyTransactions: fixture.topologyTransactions,
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
      multiHash: UNRELATED_MULTI_HASH_HEX,
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
      multiHashHex: fixture.multiHashHex,
      topologyTransactions: fixture.topologyTransactions,
      multiHashSignatureBase64: fixture.signMultiHash(),
    });

    expect(ledgerClient.allocateExternalParty).toHaveBeenCalledWith({
      synchronizer: 'global-domain::sync',
      identityProviderId: '',
      onboardingTransactions: fixture.topologyTransactions.map((transaction) => ({ transaction })),
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
      multiHashHex: fixture.multiHashHex,
      topologyTransactions: fixture.topologyTransactions,
      multiHashSignatureBase64: fixture.signMultiHash(),
      signal: controller.signal,
    });

    expect(ledgerClient.allocateExternalParty).toHaveBeenCalledWith(
      expect.objectContaining({
        synchronizer: 'global-domain::sync',
        onboardingTransactions: fixture.topologyTransactions.map((transaction) => ({ transaction })),
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
      multiHashHex: fixture.multiHashHex,
      topologyTransactions: fixture.topologyTransactions,
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
        multiHashHex: fixture.multiHashHex,
        topologyTransactions: fixture.topologyTransactions,
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
        multiHashHex: fixture.multiHashHex,
        topologyTransactions: fixture.topologyTransactions,
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
      multiHashHex: fixture.multiHashHex,
      topologyTransactions: fixture.topologyTransactions,
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
    multiHashHex: fixture.multiHashHex,
    topologyTransactions: fixture.topologyTransactions,
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
      multiHashHex: fixture.multiHashHex,
      topologyTransactions: fixture.topologyTransactions,
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
      multiHashHex: fixture.multiHashHex,
      multiHashBase64: fixture.topology.multiHash,
      topologyTransactions: fixture.topologyTransactions,
      signingAlgorithmSpec: CANTON_ED25519_SIGNATURE_ALGORITHM,
    });
    expect(ledgerClient.allocateExternalParty).toHaveBeenCalledWith({
      synchronizer: 'global-domain::sync',
      identityProviderId: 'custom-idp',
      onboardingTransactions: fixture.topologyTransactions.map((transaction) => ({ transaction })),
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

  it('forwards multi-hosting options through external signer party creation and checks the hosting', async () => {
    const fixture = createSigningFixture();
    const ledgerClient = createMockLedgerClient(fixture);
    const confirming = testParticipantUid('participant2', 0x02);
    const observing = testParticipantUid('observer1', 0x03);
    const multiHosted = fixture.topologyFor({
      participants: [
        { participantUid: observing, permission: PERMISSION.OBSERVATION },
        { participantUid: LOCAL_PARTICIPANT_UID, permission: PERMISSION.OBSERVATION },
        { participantUid: confirming, permission: PERMISSION.CONFIRMATION },
      ],
      threshold: 1,
    });
    ledgerClient.generateExternalPartyTopology.mockResolvedValueOnce(multiHosted);
    const signMultiHash = jest.fn(() => ({ signatureBase64: fixture.sign(multiHosted.multiHashHex) }));

    await createExternalPartyWithSigner({
      ledgerClient,
      synchronizerId: 'global-domain::sync',
      partyHint: 'privy-test',
      publicKeyBase64: fixture.publicKeyBase64,
      localParticipantObservationOnly: true,
      otherConfirmingParticipantUids: [confirming],
      confirmationThreshold: 1,
      observingParticipantUids: [observing],
      signMultiHash,
    });

    expect(ledgerClient.generateExternalPartyTopology).toHaveBeenCalledWith(
      expect.objectContaining({
        localParticipantObservationOnly: true,
        otherConfirmingParticipantUids: [confirming],
        confirmationThreshold: 1,
        observingParticipantUids: [observing],
      })
    );
    expect(signMultiHash).toHaveBeenCalledWith(
      expect.objectContaining({
        multiHashHex: multiHosted.multiHashHex,
        topologyTransactions: multiHosted.topologyTransactions,
      })
    );
    expect(ledgerClient.allocateExternalParty).toHaveBeenCalledTimes(1);
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
        multiHashHex: fixture.multiHashHex,
        topologyTransactions: fixture.topologyTransactions,
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
        multiHashHex: fixture.multiHashHex,
        topologyTransactions: fixture.topologyTransactions,
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
      multiHashHex: fixture.multiHashHex.toUpperCase(),
      topologyTransactions: fixture.topologyTransactions,
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
      multiHashHex: fixture.multiHashHex,
      topologyTransactions: fixture.topologyTransactions,
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
      multiHashHex: fixture.multiHashHex,
      topologyTransactions: fixture.topologyTransactions,
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
      multiHashHex: fixture.multiHashHex,
      topologyTransactions: fixture.topologyTransactions,
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

describe('external-party onboarding topology checks', () => {
  const vectorHex = (base64: string): string => Buffer.from(base64, 'base64').toString('hex');

  /** A ledger whose participant generated the real Canton 3.7.2 vector `version` for `alice`. */
  const vectorLedgerClient = (
    version: keyof typeof GENERATED_TOPOLOGY,
    answer: Partial<{ partyId: string; multiHash: string; topologyTransactions: readonly string[] }> = {}
  ): jest.Mocked<LedgerJsonApiClient> => {
    const ledgerClient = Object.create(null) as jest.Mocked<LedgerJsonApiClient>;
    ledgerClient.getParticipantId = jest.fn().mockResolvedValue({ participantId: GENERATED_TOPOLOGY_PARTICIPANT_UID });
    ledgerClient.generateExternalPartyTopology = jest.fn().mockResolvedValue({
      partyId: GENERATED_TOPOLOGY_PARTY_ID,
      multiHash: GENERATED_TOPOLOGY[version].multiHash,
      topologyTransactions: [...GENERATED_TOPOLOGY[version].topologyTransactions],
      ...answer,
    });
    ledgerClient.allocateExternalParty = jest.fn();
    return ledgerClient;
  };

  const createAlice = async (
    ledgerClient: jest.Mocked<LedgerJsonApiClient>,
    signMultiHash: jest.Mock,
    publicKeyBase64 = GENERATED_TOPOLOGY_PUBLIC_KEY,
    partyHint = 'alice'
  ): Promise<unknown> =>
    createExternalPartyWithSigner({
      ledgerClient,
      synchronizerId: 'global-domain::sync',
      partyHint,
      publicKeyBase64,
      signMultiHash,
    });

  /** Asserts `result` is the operation's refusal of the participant's answer, carrying canton-protocol's `code`. */
  const expectAnswerRefused = async (
    result: Promise<unknown>,
    code: string,
    field: RegExp | undefined,
    message = 'Canton topology generation response does not match the requested external-party onboarding'
  ): Promise<void> => {
    const error: unknown = await result.then(
      () => {
        throw new Error('expected a refusal');
      },
      (reason: unknown) => reason
    );
    expect(error).toBeInstanceOf(OperationError);
    expect(error).toMatchObject({
      message,
      code: 'TRANSACTION_FAILED',
      context: expect.objectContaining({ code }) as object,
    });
    const { cause } = error as { cause?: unknown };
    expect(isCantonProtocolError(cause, code as never)).toBe(true);
    if (field !== undefined) expect((cause as { field?: string }).field).toMatch(field);
  };

  it('builds the real Canton 3.7.2 vectors byte for byte with the test encoder', () => {
    for (const version of [31, 30] as const) {
      const vector = GENERATED_TOPOLOGY[`v${version}`];
      const transaction = encodeOnboardingTopology({
        partyId: GENERATED_TOPOLOGY_PARTY_ID,
        publicKeyDerBase64: GENERATED_TOPOLOGY_PUBLIC_KEY,
        participants: [{ participantUid: GENERATED_TOPOLOGY_PARTICIPANT_UID }],
        protoVersion: version,
      });
      expect(transaction).toBe(vector.topologyTransactions[0]);
      expect(nodeMultiHashHex([transaction])).toBe(vectorHex(vector.multiHash));
    }
  });

  it.each(['v31', 'v30'] as const)(
    'accepts the real Canton 3.7.2 %s topology and returns its multi-hash',
    async (version) => {
      const ledgerClient = vectorLedgerClient(version);

      const prepared = await prepareExternalPartyOnboarding({
        ledgerClient,
        synchronizerId: 'global-domain::sync',
        partyHint: 'alice',
        publicKeyBase64: GENERATED_TOPOLOGY_PUBLIC_KEY,
      });

      expect(ledgerClient.getParticipantId).toHaveBeenCalledTimes(1);
      expect(prepared).toMatchObject({
        partyId: GENERATED_TOPOLOGY_PARTY_ID,
        multiHashHex: vectorHex(GENERATED_TOPOLOGY[version].multiHash),
        topologyTransactions: GENERATED_TOPOLOGY[version].topologyTransactions,
      });
    }
  );

  it('accepts a participant multi-hash spelled as uppercase hex and returns it canonical', async () => {
    const hex = vectorHex(GENERATED_TOPOLOGY.v31.multiHash);
    const ledgerClient = vectorLedgerClient('v31', { multiHash: hex.toUpperCase() });

    const prepared = await prepareExternalPartyOnboarding({
      ledgerClient,
      synchronizerId: 'global-domain::sync',
      partyHint: 'alice',
      publicKeyBase64: GENERATED_TOPOLOGY_PUBLIC_KEY,
    });

    expect(prepared.multiHashHex).toBe(hex);
  });

  it('signs only the recomputed multi-hash', async () => {
    const fixture = createSigningFixture();
    const ledgerClient = createMockLedgerClient(fixture);
    const signMultiHash = jest.fn(() => ({ signatureBase64: fixture.signMultiHash() }));

    await createExternalPartyWithSigner({
      ledgerClient,
      synchronizerId: 'global-domain::sync',
      partyHint: 'privy-test',
      publicKeyBase64: fixture.publicKeyBase64,
      signMultiHash,
    });

    expect(signMultiHash).toHaveBeenCalledWith(
      expect.objectContaining({
        multiHashHex: nodeMultiHashHex(fixture.topologyTransactions),
        multiHashBase64: Buffer.from(nodeMultiHashHex(fixture.topologyTransactions), 'hex').toString('base64'),
      })
    );
  });

  it('refuses the real Canton 3.7.2 alice topology when bob was requested, before anything is signed', async () => {
    // The participant answers alice::<this key>, self-consistent and with the right multi-hash, to a request for bob.
    const ledgerClient = vectorLedgerClient('v31');
    const signMultiHash = jest.fn();

    const error: unknown = await createAlice(ledgerClient, signMultiHash, GENERATED_TOPOLOGY_PUBLIC_KEY, 'bob').then(
      () => {
        throw new Error('expected a refusal');
      },
      (reason: unknown) => reason
    );

    expect(error).toBeInstanceOf(OperationError);
    expect(error).toMatchObject({
      message: 'Canton topology generation response party ID is not the requested party',
      code: 'TRANSACTION_FAILED',
      context: {
        expectedPartyId: buildExternalPartyId('bob', fingerprintEd25519PublicKey(GENERATED_TOPOLOGY_PUBLIC_KEY)),
        partyId: GENERATED_TOPOLOGY_PARTY_ID,
      },
    });
    expect(ledgerClient.generateExternalPartyTopology).toHaveBeenCalledWith(
      expect.objectContaining({ partyHint: 'bob' })
    );
    expect(signMultiHash).not.toHaveBeenCalled();
    expect(ledgerClient.allocateExternalParty).not.toHaveBeenCalled();
  });

  it('refuses another hint on the same key with a valid topology and multi-hash for it', async () => {
    const fixture = createSigningFixture();
    const ledgerClient = createMockLedgerClient(fixture);
    const otherPartyId = buildExternalPartyId('other-hint', fixture.publicKeyFingerprint);
    const otherTopology = fixture.topologyFor({ partyId: otherPartyId });
    ledgerClient.generateExternalPartyTopology.mockResolvedValue({
      partyId: otherPartyId,
      publicKeyFingerprint: fixture.publicKeyFingerprint,
      multiHash: otherTopology.multiHash,
      topologyTransactions: [...otherTopology.topologyTransactions],
    });
    const signMultiHash = jest.fn();
    const request = {
      ledgerClient,
      synchronizerId: 'global-domain::sync',
      partyHint: 'privy-test',
      publicKeyBase64: fixture.publicKeyBase64,
    };

    for (const result of [
      prepareExternalPartyOnboarding(request),
      createExternalPartyWithSigner({ ...request, signMultiHash }),
    ]) {
      await expect(result).rejects.toBeInstanceOf(OperationError);
      await expect(result).rejects.toMatchObject({
        code: 'TRANSACTION_FAILED',
        context: { expectedPartyId: fixture.partyId, partyId: otherPartyId },
      });
    }
    expect(signMultiHash).not.toHaveBeenCalled();
    expect(ledgerClient.allocateExternalParty).not.toHaveBeenCalled();
  });

  it.each([' privy-test', 'privy-test ', 'privy-test\n', 'privy.test', 'privy::test'])(
    'refuses the party hint %j before reading the participant or generating topology',
    async (partyHint) => {
      const fixture = createSigningFixture();
      const ledgerClient = createMockLedgerClient(fixture);
      const signMultiHash = jest.fn();

      await expect(
        createExternalPartyWithSigner({
          ledgerClient,
          synchronizerId: 'global-domain::sync',
          partyHint,
          publicKeyBase64: fixture.publicKeyBase64,
          signMultiHash,
        })
      ).rejects.toBeInstanceOf(ValidationError);
      expect(ledgerClient.getParticipantId).not.toHaveBeenCalled();
      expect(ledgerClient.generateExternalPartyTopology).not.toHaveBeenCalled();
      expect(signMultiHash).not.toHaveBeenCalled();
    }
  );

  it('refuses a participant multi-hash that is not the hash of its transactions', async () => {
    const ledgerClient = vectorLedgerClient('v31', { multiHash: GENERATED_TOPOLOGY.v30.multiHash });
    const signMultiHash = jest.fn();

    await expectAnswerRefused(
      createAlice(ledgerClient, signMultiHash),
      'HASH_MISMATCH',
      /^multiHash$/,
      'Canton topology generation response multiHash is not the multi-hash of its topology transactions'
    );
    expect(signMultiHash).not.toHaveBeenCalled();
    expect(ledgerClient.allocateExternalParty).not.toHaveBeenCalled();
  });

  it('refuses a participant multi-hash that is not a Canton hash', async () => {
    const ledgerClient = vectorLedgerClient('v31', { multiHash: 'deadbeef' });
    const signMultiHash = jest.fn();

    await expectAnswerRefused(
      createAlice(ledgerClient, signMultiHash),
      'INVALID_INPUT',
      /^multiHash$/,
      'Canton topology generation response did not include a valid SHA-256 multihash'
    );
    expect(signMultiHash).not.toHaveBeenCalled();
  });

  it('refuses a topology that hosts the party on another participant than this one', async () => {
    const ledgerClient = vectorLedgerClient('v31');
    ledgerClient.getParticipantId.mockResolvedValueOnce({ participantId: testParticipantUid('participant2', 0x02) });
    const signMultiHash = jest.fn();

    await expectAnswerRefused(createAlice(ledgerClient, signMultiHash), 'UNEXPECTED', /^participants/);
    expect(signMultiHash).not.toHaveBeenCalled();
    expect(ledgerClient.allocateExternalParty).not.toHaveBeenCalled();
  });

  it('refuses a topology for another party of the same key', async () => {
    const ledgerClient = vectorLedgerClient('v31', {
      partyId: GENERATED_TOPOLOGY_PARTY_ID.replace(/^alice::/, 'bob::'),
    });
    const signMultiHash = jest.fn();

    await expectAnswerRefused(
      createAlice(ledgerClient, signMultiHash, GENERATED_TOPOLOGY_PUBLIC_KEY, 'bob'),
      'UNEXPECTED',
      /^party$/
    );
    expect(signMultiHash).not.toHaveBeenCalled();
  });

  it('refuses a topology that gives the party another key', async () => {
    const fixture = createSigningFixture();
    const other = createSigningFixture();
    const ledgerClient = createMockLedgerClient(fixture);
    ledgerClient.generateExternalPartyTopology.mockResolvedValueOnce(
      fixture.topologyFor({ publicKeyDerBase64: other.publicKeyDerBase64 })
    );
    const signMultiHash = jest.fn();

    await expectAnswerRefused(
      createExternalPartyWithSigner({
        ledgerClient,
        synchronizerId: 'global-domain::sync',
        partyHint: 'privy-test',
        publicKeyBase64: fixture.publicKeyBase64,
        signMultiHash,
      }),
      'UNEXPECTED',
      /publicKey$/
    );
    expect(signMultiHash).not.toHaveBeenCalled();
    expect(ledgerClient.allocateExternalParty).not.toHaveBeenCalled();
  });

  it.each<readonly [string, Partial<OnboardingTopologyInput>, RegExp]>([
    [
      'the local participant with another permission',
      { participants: [{ participantUid: LOCAL_PARTICIPANT_UID, permission: PERMISSION.SUBMISSION }] },
      /permission$/,
    ],
    [
      'an extra hosting participant',
      {
        participants: [
          { participantUid: LOCAL_PARTICIPANT_UID },
          { participantUid: testParticipantUid('participant2', 0x02), permission: PERMISSION.OBSERVATION },
        ],
      },
      /^participants/,
    ],
    ['another threshold', { threshold: 2 }, /^threshold$/],
    [
      'an extra key usage',
      {
        usage: [
          KEY_USAGE.NAMESPACE,
          KEY_USAGE.PROOF_OF_OWNERSHIP,
          KEY_USAGE.PROTOCOL,
          KEY_USAGE.SEQUENCER_AUTHENTICATION,
        ],
      },
      /usage$/,
    ],
    ['a missing key usage', { usage: [KEY_USAGE.NAMESPACE, KEY_USAGE.PROTOCOL] }, /usage$/],
  ])('refuses a topology with %s', async (_name, change, field) => {
    const fixture = createSigningFixture();
    const ledgerClient = createMockLedgerClient(fixture);
    ledgerClient.generateExternalPartyTopology.mockResolvedValueOnce(fixture.topologyFor(change));
    const signMultiHash = jest.fn();

    await expectAnswerRefused(
      createExternalPartyWithSigner({
        ledgerClient,
        synchronizerId: 'global-domain::sync',
        partyHint: 'privy-test',
        publicKeyBase64: fixture.publicKeyBase64,
        signMultiHash,
      }),
      'UNEXPECTED',
      field
    );
    expect(signMultiHash).not.toHaveBeenCalled();
    expect(ledgerClient.allocateExternalParty).not.toHaveBeenCalled();
  });

  it('refuses more than one generated transaction (the shape of Canton 3.3 and earlier)', async () => {
    const transactions = [
      ...GENERATED_TOPOLOGY.v31.topologyTransactions,
      ...GENERATED_TOPOLOGY.v30.topologyTransactions,
    ];
    const ledgerClient = vectorLedgerClient('v31', {
      topologyTransactions: transactions,
      multiHash: Buffer.from(nodeMultiHashHex(transactions), 'hex').toString('base64'),
    });
    const signMultiHash = jest.fn();

    await expectAnswerRefused(createAlice(ledgerClient, signMultiHash), 'UNEXPECTED', /^transactions$/);
    expect(signMultiHash).not.toHaveBeenCalled();
  });

  it('refuses a transaction that does not decode', async () => {
    const transactions = [Buffer.from('not a topology transaction').toString('base64')];
    const ledgerClient = vectorLedgerClient('v31', {
      topologyTransactions: transactions,
      multiHash: Buffer.from(nodeMultiHashHex(transactions), 'hex').toString('base64'),
    });
    const signMultiHash = jest.fn();

    await expectAnswerRefused(createAlice(ledgerClient, signMultiHash), 'UNDECODABLE', undefined);
    expect(signMultiHash).not.toHaveBeenCalled();
  });

  it.each([
    ['with the PAR:: member prefix', { participantId: `PAR::${LOCAL_PARTICIPANT_UID}` }],
    ['that is not a participant UID', { participantId: 'participant1' }],
    ['without participantId', {}],
  ])('refuses a participant-id answer %s before generating topology', async (_name, answer) => {
    const fixture = createSigningFixture();
    const ledgerClient = createMockLedgerClient(fixture);
    ledgerClient.getParticipantId.mockResolvedValueOnce(answer as never);

    await expect(
      prepareExternalPartyOnboarding({
        ledgerClient,
        synchronizerId: 'global-domain::sync',
        partyHint: 'privy-test',
        publicKeyBase64: fixture.publicKeyBase64,
      })
    ).rejects.toMatchObject({
      name: 'OperationError',
      code: 'TRANSACTION_FAILED',
      message: 'Canton participant-id response did not include a participant unique identifier (name::1220…)',
    });
    expect(ledgerClient.generateExternalPartyTopology).not.toHaveBeenCalled();
  });

  const confirming = testParticipantUid('participant2', 0x02);
  it.each<readonly [string, Partial<Parameters<typeof prepareExternalPartyOnboarding>[0]>, string, boolean]>([
    [
      'a participant UID that is not one',
      { otherConfirmingParticipantUids: ['participant-1'] },
      'must be a participant unique identifier',
      false,
    ],
    [
      'a PAR:: participant UID',
      { observingParticipantUids: [`PAR::${confirming}`] },
      'must be a participant unique identifier',
      false,
    ],
    [
      'a participant listed twice',
      { otherConfirmingParticipantUids: [confirming], observingParticipantUids: [confirming] },
      'listed more than once',
      false,
    ],
    ['a negative threshold', { confirmationThreshold: -1 }, 'non-negative integer', false],
    ['a fractional threshold', { confirmationThreshold: 1.5 }, 'non-negative integer', false],
    [
      'a threshold above the confirmers',
      { confirmationThreshold: 2 },
      'exceeds the number of confirming participants',
      false,
    ],
    [
      'no confirming participant',
      { localParticipantObservationOnly: true },
      'at least one confirming participant',
      false,
    ],
    [
      'the local participant among the others',
      { otherConfirmingParticipantUids: [LOCAL_PARTICIPANT_UID] },
      'local participant must not be listed',
      true,
    ],
  ])('refuses %s before generating topology', async (_name, options, message, readsParticipantId) => {
    const fixture = createSigningFixture();
    const ledgerClient = createMockLedgerClient(fixture);

    const result = prepareExternalPartyOnboarding({
      ledgerClient,
      synchronizerId: 'global-domain::sync',
      partyHint: 'privy-test',
      publicKeyBase64: fixture.publicKeyBase64,
      ...options,
    });

    await expect(result).rejects.toBeInstanceOf(ValidationError);
    await expect(result).rejects.toThrow(message);
    expect(ledgerClient.getParticipantId).toHaveBeenCalledTimes(readsParticipantId ? 1 : 0);
    expect(ledgerClient.generateExternalPartyTopology).not.toHaveBeenCalled();
  });

  it('expects every confirmer as the threshold when confirmationThreshold is 0', async () => {
    const fixture = createSigningFixture();
    const ledgerClient = createMockLedgerClient(fixture);
    const twoConfirmers = (threshold: number): GeneratedTopologyAnswer =>
      fixture.topologyFor({
        participants: [{ participantUid: LOCAL_PARTICIPANT_UID }, { participantUid: confirming }],
        threshold,
      });
    const options = {
      ledgerClient,
      synchronizerId: 'global-domain::sync',
      partyHint: 'privy-test',
      publicKeyBase64: fixture.publicKeyBase64,
      otherConfirmingParticipantUids: [confirming],
      confirmationThreshold: 0,
    };

    ledgerClient.generateExternalPartyTopology.mockResolvedValueOnce(twoConfirmers(2));
    await expect(prepareExternalPartyOnboarding(options)).resolves.toMatchObject({
      multiHashHex: twoConfirmers(2).multiHashHex,
    });

    ledgerClient.generateExternalPartyTopology.mockResolvedValueOnce(twoConfirmers(1));
    await expectAnswerRefused(prepareExternalPartyOnboarding(options), 'UNEXPECTED', /^threshold$/);
  });

  describe('submit', () => {
    const submitOptions = (
      fixture: SigningFixture,
      ledgerClient: jest.Mocked<LedgerJsonApiClient>,
      change: Partial<Parameters<typeof submitExternalPartyOnboarding>[0]>
    ): Parameters<typeof submitExternalPartyOnboarding>[0] => ({
      ledgerClient,
      synchronizerId: 'global-domain::sync',
      partyId: fixture.partyId,
      publicKeyBase64: fixture.publicKeyBase64,
      multiHashHex: fixture.multiHashHex,
      topologyTransactions: fixture.topologyTransactions,
      multiHashSignatureBase64: fixture.signMultiHash(),
      ...change,
    });

    it('refuses a multi-hash that is not the hash of the submitted transactions, even when it is signed', async () => {
      const fixture = createSigningFixture();
      const ledgerClient = createMockLedgerClient(fixture);
      const other = fixture.topologyFor({
        threshold: 1,
        participants: [{ participantUid: testParticipantUid('p', 7) }],
      });

      for (const change of [
        // The signed multi-hash of other transactions.
        { multiHashHex: other.multiHashHex, multiHashSignatureBase64: fixture.sign(other.multiHashHex) },
        // Other transactions under the signed multi-hash.
        { topologyTransactions: other.topologyTransactions },
      ]) {
        const result = submitExternalPartyOnboarding(submitOptions(fixture, ledgerClient, change));
        await expect(result).rejects.toBeInstanceOf(ValidationError);
        await expect(result).rejects.toThrow('multiHashHex is not the multi-hash of topologyTransactions');
      }
      expect(ledgerClient.allocateExternalParty).not.toHaveBeenCalled();
    });

    it.each([
      ['no transactions', []],
      ['a transaction that is not base64', ['not base64!']],
    ])('refuses %s before allocating', async (_name, topologyTransactions) => {
      const fixture = createSigningFixture();
      const ledgerClient = createMockLedgerClient(fixture);

      const result = submitExternalPartyOnboarding(submitOptions(fixture, ledgerClient, { topologyTransactions }));

      await expect(result).rejects.toBeInstanceOf(ValidationError);
      const error: unknown = await result.catch((reason: unknown) => reason);
      expect(isCantonProtocolError((error as { cause?: unknown }).cause, 'INVALID_INPUT')).toBe(true);
      expect(ledgerClient.allocateExternalParty).not.toHaveBeenCalled();
    });

    it('allocates the real v31 transactions under their recomputed multi-hash', async () => {
      // No private key for the vector: the multi-hash check passes, then the signature check refuses.
      const ledgerClient = vectorLedgerClient('v31');
      const fixture = createSigningFixture();

      await expect(
        submitExternalPartyOnboarding({
          ledgerClient,
          synchronizerId: 'global-domain::sync',
          partyId: GENERATED_TOPOLOGY_PARTY_ID,
          publicKeyBase64: GENERATED_TOPOLOGY_PUBLIC_KEY,
          multiHashHex: vectorHex(GENERATED_TOPOLOGY.v31.multiHash),
          topologyTransactions: GENERATED_TOPOLOGY.v31.topologyTransactions,
          multiHashSignatureBase64: fixture.sign(vectorHex(GENERATED_TOPOLOGY.v31.multiHash)),
        })
      ).rejects.toThrow('Invalid Canton hash signature');
      expect(ledgerClient.allocateExternalParty).not.toHaveBeenCalled();
    });
  });
});
