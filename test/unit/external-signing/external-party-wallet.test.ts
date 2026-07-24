import { generateKeyPairSync, sign } from 'node:crypto';
import type { LedgerJsonApiClient } from '../../../src/clients/ledger-json-api';
import type { ValidatorApiClient } from '../../../src/clients/validator-api';
import type { TransferOffer } from '../../../src/clients/validator-api/schemas/api/wallet';
import { ApiError } from '../../../src/core/errors';
import { CANTON_TRANSFER_OFFER_TEMPLATE_ID } from '../../../src/utils/amulet/external-party-transfer-offer';
import {
  buildCantonPrepareToken,
  buildExternalPartyId,
  createExternalPartyWalletBridge,
  deriveCantonEd25519PublicKeyFingerprint,
  hashPreparedTransaction,
  parseExternalPartyWalletConnectedSynchronizerId,
  type ExternalPartyWalletBridge,
} from '../../../src/utils/external-signing';

const PREPARED_TRANSACTION_HASH_HEX = `1220${'22'.repeat(32)}`;
const PREPARED_TRANSACTION_HASH_BASE64 = Buffer.from(PREPARED_TRANSACTION_HASH_HEX, 'hex').toString('base64');
const MULTI_HASH_HEX = `1220${'11'.repeat(32)}`;
const OFFER_CONTRACT_ID = '00offer-contract-id';
const SYNCHRONIZER_ID = 'global-domain::sync';

const createMockTransferOffer = (input: {
  readonly receiverPartyId: string;
  readonly amount: string;
  readonly description?: string;
}): TransferOffer => ({
  contract_id: OFFER_CONTRACT_ID,
  receiver_party_id: input.receiverPartyId,
  amount: input.amount,
  description: input.description ?? '',
  expires_at: 1_780_086_400_000_000,
  tracking_id: 'provider-transfer-tracking-id',
  transfer_offer: {
    contract: {
      contract_id: OFFER_CONTRACT_ID,
      template_id: CANTON_TRANSFER_OFFER_TEMPLATE_ID,
      created_event_blob: 'created-event-blob',
      synchronizer_id: SYNCHRONIZER_ID,
    },
  },
});

const createSigningFixture = (): {
  readonly publicKeyBase64: string;
  readonly publicKeyFingerprint: string;
  readonly partyId: string;
  readonly signPreparedHash: () => string;
  readonly signMultiHash: () => string;
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
    signPreparedHash: (): string =>
      sign(null, Buffer.from(PREPARED_TRANSACTION_HASH_HEX, 'hex'), privateKey).toString('base64'),
    signMultiHash: (): string => sign(null, Buffer.from(MULTI_HASH_HEX, 'hex'), privateKey).toString('base64'),
  };
};

const createMockLedgerClient = (): jest.Mocked<LedgerJsonApiClient> =>
  ({
    getConnectedSynchronizers: jest.fn().mockResolvedValue({
      connectedSynchronizers: [{ synchronizerId: SYNCHRONIZER_ID }],
    }),
    getActiveContracts: jest.fn().mockResolvedValue([]),
    interactiveSubmissionPrepare: jest.fn().mockResolvedValue({
      preparedTransaction: 'prepared-provider-accept',
      preparedTransactionHash: PREPARED_TRANSACTION_HASH_BASE64,
      hashingSchemeVersion: 'HASHING_SCHEME_VERSION_V2',
    }),
    interactiveSubmissionExecuteAndWait: jest.fn().mockResolvedValue({
      updateId: 'provider-accept-update-1',
      completionOffset: 456,
    }),
    listParties: jest.fn().mockResolvedValue({ partyDetails: [] }),
    getPartyDetails: jest.fn().mockResolvedValue({ partyDetails: [] }),
    allocateExternalParty: jest.fn(),
  }) as unknown as jest.Mocked<LedgerJsonApiClient>;

const createMockValidatorClient = (): jest.Mocked<ValidatorApiClient> =>
  ({
    lookupTransferCommandCounterByParty: jest.fn().mockResolvedValue({
      transfer_command_counter: {
        contract: {
          payload: { nextNonce: '3' },
        },
      },
    }),
    prepareTransferPreapprovalSend: jest.fn().mockResolvedValue({
      transaction: 'prepared-cc-transfer',
      tx_hash: PREPARED_TRANSACTION_HASH_HEX,
      transfer_command_contract_id_prefix: 'transfer-command-prefix',
      expiresAt: 'ignored-by-helper',
    }),
    submitTransferPreapprovalSend: jest.fn().mockResolvedValue({
      update_id: 'cc-transfer-update-1',
    }),
    lookupTransferPreapprovalByParty: jest.fn().mockResolvedValue({
      transfer_preapproval: {
        contract: {
          contract_id: 'transfer-preapproval-contract-id',
        },
      },
    }),
    listExternalPartySetupProposals: jest.fn().mockResolvedValue({ contracts: [] }),
    createExternalPartySetupProposal: jest.fn().mockResolvedValue({
      contract_id: 'setup-proposal-contract-id',
    }),
    prepareAcceptExternalPartySetupProposal: jest.fn().mockResolvedValue({
      transaction: 'prepared-transfer-preapproval-setup',
      tx_hash: PREPARED_TRANSACTION_HASH_HEX,
    }),
    submitAcceptExternalPartySetupProposal: jest.fn().mockResolvedValue({
      transfer_preapproval_contract_id: 'transfer-preapproval-contract-id',
      update_id: 'transfer-preapproval-update-1',
    }),
    transferPreapprovalSend: jest.fn().mockResolvedValue(undefined),
    getWalletBalance: jest.fn().mockResolvedValue({ effective_unlocked_qty: '100.0' }),
    createTransferOffer: jest.fn().mockResolvedValue({
      offer_contract_id: OFFER_CONTRACT_ID,
    }),
    getTransferOfferStatus: jest.fn().mockResolvedValue({
      transaction_id: 'provider-offer-update-1',
    }),
    listTransferOffers: jest.fn().mockResolvedValue({
      offers: [
        createMockTransferOffer({
          receiverPartyId: 'receiver::fingerprint',
          amount: '5',
        }),
      ],
    }),
    getExternalPartyBalance: jest.fn().mockResolvedValue({ effective_unlocked_qty: '5.0' }),
  }) as unknown as jest.Mocked<ValidatorApiClient>;

const createBridge = (
  overrides: {
    readonly ledgerClient?: jest.Mocked<LedgerJsonApiClient>;
    readonly validatorClient?: jest.Mocked<ValidatorApiClient> | null;
  } = {}
): ExternalPartyWalletBridge =>
  createExternalPartyWalletBridge({
    ledgerClient: overrides.ledgerClient ?? createMockLedgerClient(),
    validatorClient: overrides.validatorClient === undefined ? createMockValidatorClient() : overrides.validatorClient,
    providerPartyId: 'provider::fingerprint',
    providerUserId: 'provider-user',
    prepareTokenSecret: 'prepare-token-secret',
    provider: '5n',
    network: 'devnet',
    now: (): number => 1_780_000_000_000,
    randomId: (): string => 'deterministic-id',
  });

describe('external-party wallet bridge', (): void => {
  beforeEach((): void => {
    jest.clearAllMocks();
  });

  it('uses one cancellation signal for synchronizer lookup and external-party allocation', async (): Promise<void> => {
    const fixture = createSigningFixture();
    const ledgerClient = createMockLedgerClient();
    ledgerClient.allocateExternalParty.mockResolvedValueOnce({ partyId: fixture.partyId });
    const bridge = createBridge({ ledgerClient });
    const controller = new AbortController();

    const submitted = await bridge.submitExternalPartySignature(
      {
        partyId: fixture.partyId,
        publicKeyBase64: fixture.publicKeyBase64,
        publicKeyFingerprint: fixture.publicKeyFingerprint,
        multiHashHex: MULTI_HASH_HEX,
        synchronizerId: SYNCHRONIZER_ID,
        topologyTransactions: ['topology-tx'],
        multiHashSignatureBase64: fixture.signMultiHash(),
      },
      { signal: controller.signal }
    );

    expect(ledgerClient.getConnectedSynchronizers).toHaveBeenCalledWith(
      { party: 'provider::fingerprint' },
      { signal: controller.signal }
    );
    expect(ledgerClient.allocateExternalParty).toHaveBeenCalledWith(
      expect.objectContaining({
        synchronizer: SYNCHRONIZER_ID,
        onboardingTransactions: [{ transaction: 'topology-tx' }],
      }),
      { signal: controller.signal }
    );
    expect(submitted).toEqual({
      partyId: fixture.partyId,
      raw: { partyId: fixture.partyId },
      alreadyExisted: false,
    });
  });

  it('forwards cancellation to exact external-party recovery lookups', async (): Promise<void> => {
    const fixture = createSigningFixture();
    const ledgerClient = createMockLedgerClient();
    const bridge = createBridge({ ledgerClient });
    const controller = new AbortController();

    await bridge.listExternalPartiesForPublicKey(
      {
        partyName: 'privy-test',
        publicKeyBase64: fixture.publicKeyBase64,
      },
      { signal: controller.signal }
    );

    expect(ledgerClient.getPartyDetails).toHaveBeenCalledWith(
      {
        party: fixture.partyId,
        identityProviderId: '',
      },
      { signal: controller.signal }
    );
  });

  it('prepares and submits an externally signed CC transfer with a token-bound payload', async (): Promise<void> => {
    const fixture = createSigningFixture();
    const validatorClient = createMockValidatorClient();
    const bridge = createBridge({ validatorClient });

    const prepared = await bridge.prepareCcTransfer({
      senderPartyId: fixture.partyId,
      receiverPartyId: 'receiver::fingerprint',
      amount: '2.5',
      description: 'demo transfer',
      publicKeyBase64: fixture.publicKeyBase64,
      tokenContext: { userId: 'user-1', externalUserId: 'did:wallet:user-1' },
    });

    expect(prepared).toMatchObject({
      senderPartyId: fixture.partyId,
      receiverPartyId: 'receiver::fingerprint',
      amount: '2.5',
      description: 'demo transfer',
      preparedTransaction: 'prepared-cc-transfer',
      preparedTransactionHashHex: PREPARED_TRANSACTION_HASH_HEX,
      transferCommandContractIdPrefix: 'transfer-command-prefix',
      nonce: 3,
      expiresAt: expect.any(String) as string,
    });

    const submitted = await bridge.submitCcTransfer({
      ...prepared,
      publicKeyBase64: fixture.publicKeyBase64,
      signatureBase64: fixture.signPreparedHash(),
      tokenContext: { userId: 'user-1', externalUserId: 'did:wallet:user-1' },
    });

    expect(validatorClient.submitTransferPreapprovalSend).toHaveBeenCalledWith({
      submission: {
        party_id: fixture.partyId,
        transaction: 'prepared-cc-transfer',
        signed_tx_hash: expect.stringMatching(/^[0-9a-f]+$/) as string,
        public_key: Buffer.from(fixture.publicKeyBase64, 'base64').toString('hex'),
      },
    });
    expect(submitted).toEqual({
      senderPartyId: fixture.partyId,
      updateId: 'cc-transfer-update-1',
      raw: { update_id: 'cc-transfer-update-1' },
    });
  });

  it('rejects CC transfer submit when submitted details do not match the prepare token', async (): Promise<void> => {
    const fixture = createSigningFixture();
    const validatorClient = createMockValidatorClient();
    const bridge = createBridge({ validatorClient });
    const prepared = await bridge.prepareCcTransfer({
      senderPartyId: fixture.partyId,
      receiverPartyId: 'receiver::fingerprint',
      amount: '2.5',
      publicKeyBase64: fixture.publicKeyBase64,
      tokenContext: { userId: 'user-1' },
    });

    await expect(
      bridge.submitCcTransfer({
        ...prepared,
        amount: '2.6',
        publicKeyBase64: fixture.publicKeyBase64,
        signatureBase64: fixture.signPreparedHash(),
        tokenContext: { userId: 'user-1' },
      })
    ).rejects.toThrow('Prepared Canton transaction token does not match the submitted details');

    expect(validatorClient.submitTransferPreapprovalSend).not.toHaveBeenCalled();
  });

  it.each(['0', '0.0', '0x10', '1e3', '01', '-1'])(
    'rejects non-positive or non-decimal CC transfer amount %s',
    async (amount: string): Promise<void> => {
      const fixture = createSigningFixture();
      const validatorClient = createMockValidatorClient();
      const bridge = createBridge({ validatorClient });

      await expect(
        bridge.prepareCcTransfer({
          senderPartyId: fixture.partyId,
          receiverPartyId: 'receiver::fingerprint',
          amount,
          publicKeyBase64: fixture.publicKeyBase64,
        })
      ).rejects.toThrow('amount must be a positive decimal amount');

      expect(validatorClient.prepareTransferPreapprovalSend).not.toHaveBeenCalled();
    }
  );

  it('rejects invalid provider transfer offer TTLs during bridge construction', (): void => {
    expect(() =>
      createExternalPartyWalletBridge({
        ledgerClient: createMockLedgerClient(),
        validatorClient: createMockValidatorClient(),
        providerPartyId: 'provider::fingerprint',
        providerUserId: 'provider-user',
        prepareTokenSecret: 'prepare-token-secret',
        providerTransferOfferTtlMs: 0,
      })
    ).toThrow('providerTransferOfferTtlMs must be a positive safe integer');
  });

  it('preserves a successful CC transfer outcome when afterSubmit fails', async (): Promise<void> => {
    const fixture = createSigningFixture();
    const bridge = createBridge();
    const prepared = await bridge.prepareCcTransfer({
      senderPartyId: fixture.partyId,
      receiverPartyId: 'receiver::fingerprint',
      amount: '2.5',
      publicKeyBase64: fixture.publicKeyBase64,
    });

    await expect(
      bridge.submitCcTransfer(
        {
          ...prepared,
          publicKeyBase64: fixture.publicKeyBase64,
          signatureBase64: fixture.signPreparedHash(),
        },
        {
          afterSubmit: async (): Promise<void> => {
            throw new Error('tracking write failed');
          },
        }
      )
    ).rejects.toMatchObject({
      message: 'afterSubmit hook failed after Canton CC transfer submit succeeded',
      context: expect.objectContaining({
        senderPartyId: fixture.partyId,
        updateId: 'cc-transfer-update-1',
        hookCause: expect.objectContaining({
          message: 'tracking write failed',
        }) as object,
      }) as object,
    });
  });

  it('preserves a failed CC transfer outcome when afterSubmitFailure fails', async (): Promise<void> => {
    const fixture = createSigningFixture();
    const validatorClient = createMockValidatorClient();
    validatorClient.submitTransferPreapprovalSend.mockRejectedValueOnce(new ApiError('validator unavailable', 503));
    const bridge = createBridge({ validatorClient });
    const prepared = await bridge.prepareCcTransfer({
      senderPartyId: fixture.partyId,
      receiverPartyId: 'receiver::fingerprint',
      amount: '2.5',
      publicKeyBase64: fixture.publicKeyBase64,
    });

    await expect(
      bridge.submitCcTransfer(
        {
          ...prepared,
          publicKeyBase64: fixture.publicKeyBase64,
          signatureBase64: fixture.signPreparedHash(),
        },
        {
          afterSubmitFailure: async (): Promise<void> => {
            throw new Error('failure tracking write failed');
          },
        }
      )
    ).rejects.toMatchObject({
      message: 'afterSubmitFailure hook failed after Canton CC transfer submit failed',
      context: expect.objectContaining({
        senderPartyId: fixture.partyId,
        submitCause: expect.objectContaining({
          message: 'validator unavailable',
          status: 503,
        }) as object,
        hookCause: expect.objectContaining({
          message: 'failure tracking write failed',
        }) as object,
      }) as object,
    });
  });

  it('creates a provider-funded offer and prepares user-approved acceptance', async (): Promise<void> => {
    const fixture = createSigningFixture();
    const ledgerClient = createMockLedgerClient();
    const validatorClient = createMockValidatorClient();
    const bridge = createBridge({ ledgerClient, validatorClient });

    const prepared = await bridge.prepareProviderTransfer({
      receiverPartyId: fixture.partyId,
      amount: '5',
      description: 'provider funding',
      publicKeyBase64: fixture.publicKeyBase64,
      tokenContext: { userId: 'user-1' },
    });

    expect(validatorClient.createTransferOffer).toHaveBeenCalledWith({
      receiver_party_id: fixture.partyId,
      amount: '5',
      description: 'provider funding',
      expires_at: 1780086400000000,
      tracking_id: expect.stringMatching(/^provider-funding-[0-9a-f]{32}$/) as string,
    });
    expect(ledgerClient.interactiveSubmissionPrepare).toHaveBeenCalledWith(
      expect.objectContaining({
        commandId: 'accept-provider-offer-deterministic-id',
        userId: 'provider-user',
        actAs: [fixture.partyId],
        readAs: [fixture.partyId],
        disclosedContracts: [
          {
            contractId: OFFER_CONTRACT_ID,
            templateId: CANTON_TRANSFER_OFFER_TEMPLATE_ID,
            createdEventBlob: 'created-event-blob',
            synchronizerId: SYNCHRONIZER_ID,
          },
        ],
      })
    );
    expect(prepared).toMatchObject({
      sourcePartyId: 'provider::fingerprint',
      receiverPartyId: fixture.partyId,
      offerContractId: OFFER_CONTRACT_ID,
      offerUpdateId: 'provider-offer-update-1',
      preparedTransactionHashHex: PREPARED_TRANSACTION_HASH_HEX,
    });

    const submitted = await bridge.submitProviderTransfer({
      ...prepared,
      publicKeyBase64: fixture.publicKeyBase64,
      signatureBase64: fixture.signPreparedHash(),
      tokenContext: { userId: 'user-1' },
    });

    expect(ledgerClient.interactiveSubmissionExecuteAndWait).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'provider-user',
        preparedTransaction: 'prepared-provider-accept',
        hashingSchemeVersion: 'HASHING_SCHEME_VERSION_V2',
        partySignatures: {
          signatures: [
            {
              party: fixture.partyId,
              signatures: [
                expect.objectContaining({
                  signature: fixture.signPreparedHash(),
                  signedBy: fixture.publicKeyFingerprint,
                }) as object,
              ],
            },
          ],
        },
      })
    );
    expect(submitted.updateId).toBe('provider-accept-update-1');
    expect(submitted.raw).toEqual({ updateId: 'provider-accept-update-1', completionOffset: 456 });
  });

  it('prepares and submits transfer preapproval setup through validator endpoints', async (): Promise<void> => {
    const fixture = createSigningFixture();
    const validatorClient = createMockValidatorClient();
    validatorClient.lookupTransferPreapprovalByParty.mockRejectedValueOnce(new ApiError('not found', 404));
    const bridge = createBridge({ validatorClient });

    const prepared = await bridge.prepareTransferPreapprovalSetup({
      partyId: fixture.partyId,
      publicKeyBase64: fixture.publicKeyBase64,
    });

    expect(validatorClient.createExternalPartySetupProposal).toHaveBeenCalledWith({
      user_party_id: fixture.partyId,
    });
    expect(validatorClient.prepareAcceptExternalPartySetupProposal).toHaveBeenCalledWith({
      contract_id: 'setup-proposal-contract-id',
      user_party_id: fixture.partyId,
      verbose_hashing: false,
    });
    expect(prepared).toMatchObject({
      partyId: fixture.partyId,
      publicKeyFingerprint: fixture.publicKeyFingerprint,
      alreadyPreapproved: false,
      setupProposalContractId: 'setup-proposal-contract-id',
      preparedTransaction: 'prepared-transfer-preapproval-setup',
      preparedTransactionHashHex: PREPARED_TRANSACTION_HASH_HEX,
    });

    const submitted = await bridge.submitTransferPreapprovalSetup({
      partyId: fixture.partyId,
      publicKeyBase64: fixture.publicKeyBase64,
      preparedTransaction: prepared.preparedTransaction ?? '',
      preparedTransactionHashHex: prepared.preparedTransactionHashHex ?? '',
      signatureBase64: fixture.signPreparedHash(),
    });

    expect(validatorClient.submitAcceptExternalPartySetupProposal).toHaveBeenCalledWith({
      submission: {
        party_id: fixture.partyId,
        transaction: 'prepared-transfer-preapproval-setup',
        signed_tx_hash: expect.stringMatching(/^[0-9a-f]+$/) as string,
        public_key: Buffer.from(fixture.publicKeyBase64, 'base64').toString('hex'),
      },
    });
    expect(submitted).toEqual({
      partyId: fixture.partyId,
      transferPreapprovalContractId: 'transfer-preapproval-contract-id',
      updateId: 'transfer-preapproval-update-1',
      raw: {
        transfer_preapproval_contract_id: 'transfer-preapproval-contract-id',
        update_id: 'transfer-preapproval-update-1',
      },
    });
  });

  it('rejects transfer preapproval setup submit when the party does not match the public key', async (): Promise<void> => {
    const fixture = createSigningFixture();
    const validatorClient = createMockValidatorClient();
    const bridge = createBridge({ validatorClient });

    await expect(
      bridge.submitTransferPreapprovalSetup({
        partyId: 'wrong-party::fingerprint',
        publicKeyBase64: fixture.publicKeyBase64,
        preparedTransaction: 'prepared-transfer-preapproval-setup',
        preparedTransactionHashHex: PREPARED_TRANSACTION_HASH_HEX,
        signatureBase64: fixture.signPreparedHash(),
      })
    ).rejects.toThrow('Canton party ID does not match the submitted public key');

    expect(validatorClient.submitAcceptExternalPartySetupProposal).not.toHaveBeenCalled();
  });

  it('reports an existing transfer preapproval without creating a setup proposal', async (): Promise<void> => {
    const fixture = createSigningFixture();
    const validatorClient = createMockValidatorClient();
    const bridge = createBridge({ validatorClient });

    const prepared = await bridge.prepareTransferPreapprovalSetup({
      partyId: fixture.partyId,
      publicKeyBase64: fixture.publicKeyBase64,
    });

    expect(prepared).toMatchObject({
      partyId: fixture.partyId,
      alreadyPreapproved: true,
      transferPreapprovalContractId: 'transfer-preapproval-contract-id',
      preparedTransaction: null,
      preparedTransactionHashHex: null,
    });
    expect(validatorClient.createExternalPartySetupProposal).not.toHaveBeenCalled();
    expect(validatorClient.prepareAcceptExternalPartySetupProposal).not.toHaveBeenCalled();
  });

  it('sends provider wallet CC to a preapproved receiver', async (): Promise<void> => {
    const fixture = createSigningFixture();
    const validatorClient = createMockValidatorClient();
    const bridge = createBridge({ validatorClient });

    const sent = await bridge.sendProviderTransferToPreapprovedParty({
      receiverPartyId: fixture.partyId,
      amount: '3.5',
      description: 'preapproved funding',
      idempotencyKey: 'dedupe-1',
    });

    expect(validatorClient.transferPreapprovalSend).toHaveBeenCalledWith({
      receiver_party_id: fixture.partyId,
      amount: '3.5',
      deduplication_id: 'dedupe-1',
      description: 'preapproved funding',
    });
    expect(sent).toEqual({
      sourcePartyId: 'provider::fingerprint',
      receiverPartyId: fixture.partyId,
      amount: '3.5',
      description: 'preapproved funding',
      transferPreapprovalContractId: 'transfer-preapproval-contract-id',
      sourceBalanceAfter: { effective_unlocked_qty: '100.0' },
      raw: {
        transferPreapproval: {
          contract: {
            contract_id: 'transfer-preapproval-contract-id',
          },
        },
      },
    });
  });

  it('does not send provider wallet CC when the receiver has no transfer preapproval', async (): Promise<void> => {
    const fixture = createSigningFixture();
    const validatorClient = createMockValidatorClient();
    validatorClient.lookupTransferPreapprovalByParty.mockRejectedValueOnce(new ApiError('not found', 404));
    const bridge = createBridge({ validatorClient });

    await expect(
      bridge.sendProviderTransferToPreapprovedParty({
        receiverPartyId: fixture.partyId,
        amount: '3.5',
        idempotencyKey: 'dedupe-1',
      })
    ).rejects.toHaveProperty('code', 'MISSING_CONTRACT');

    expect(validatorClient.transferPreapprovalSend).not.toHaveBeenCalled();
  });

  it('lets callers resume provider-funded acceptance prepare without creating duplicate offers', async (): Promise<void> => {
    const fixture = createSigningFixture();
    const ledgerClient = createMockLedgerClient();
    const validatorClient = createMockValidatorClient();
    validatorClient.listTransferOffers.mockResolvedValueOnce({ offers: [] });
    ledgerClient.getActiveContracts.mockResolvedValueOnce([]);
    const bridge = createBridge({ ledgerClient, validatorClient });

    await expect(
      bridge.prepareProviderTransfer({
        receiverPartyId: fixture.partyId,
        amount: '5',
        publicKeyBase64: fixture.publicKeyBase64,
      })
    ).rejects.toMatchObject({
      message:
        'Canton provider-funded transfer acceptance prepare failed; retry with the returned offerContractId to avoid creating a duplicate offer',
      context: expect.objectContaining({
        offerContractId: OFFER_CONTRACT_ID,
        offerUpdateId: 'provider-offer-update-1',
        receiverPartyId: fixture.partyId,
      }) as object,
    });

    validatorClient.listTransferOffers.mockResolvedValueOnce({
      offers: [
        createMockTransferOffer({
          receiverPartyId: fixture.partyId,
          amount: '5',
        }),
      ],
    });
    const prepared = await bridge.prepareProviderTransfer({
      receiverPartyId: fixture.partyId,
      amount: '5',
      publicKeyBase64: fixture.publicKeyBase64,
      offerContractId: OFFER_CONTRACT_ID,
      offerUpdateId: 'provider-offer-update-1',
      commandId: 'resume-provider-offer',
    });

    expect(validatorClient.createTransferOffer).toHaveBeenCalledTimes(1);
    expect(prepared).toMatchObject({
      offerContractId: OFFER_CONTRACT_ID,
      offerUpdateId: 'provider-offer-update-1',
      commandId: 'resume-provider-offer',
      preparedTransactionHashHex: PREPARED_TRANSACTION_HASH_HEX,
    });
  });

  it('rejects resumed provider-funded offers that do not match the requested transfer details', async (): Promise<void> => {
    const fixture = createSigningFixture();
    const ledgerClient = createMockLedgerClient();
    const validatorClient = createMockValidatorClient();
    validatorClient.listTransferOffers.mockResolvedValueOnce({
      offers: [
        createMockTransferOffer({
          receiverPartyId: fixture.partyId,
          amount: '6',
        }),
      ],
    });
    const bridge = createBridge({ ledgerClient, validatorClient });

    await expect(
      bridge.prepareProviderTransfer({
        receiverPartyId: fixture.partyId,
        amount: '5',
        publicKeyBase64: fixture.publicKeyBase64,
        offerContractId: OFFER_CONTRACT_ID,
      })
    ).rejects.toThrow('Resumed provider transfer offer does not match the requested transfer details');

    expect(validatorClient.createTransferOffer).not.toHaveBeenCalled();
    expect(ledgerClient.interactiveSubmissionPrepare).not.toHaveBeenCalled();
  });

  it('surfaces provider-funded optional read failures that are not not-found responses', async (): Promise<void> => {
    const fixture = createSigningFixture();
    const validatorClient = createMockValidatorClient();
    validatorClient.getTransferOfferStatus.mockRejectedValueOnce(new ApiError('validator unavailable', 503));
    const bridge = createBridge({ validatorClient });

    await expect(
      bridge.prepareProviderTransfer({
        receiverPartyId: fixture.partyId,
        amount: '5',
        publicKeyBase64: fixture.publicKeyBase64,
      })
    ).rejects.toMatchObject({
      name: 'ApiError',
      status: 503,
    });
  });

  it('falls back to active Amulet contracts when the external-party balance wallet is missing', async (): Promise<void> => {
    const fixture = createSigningFixture();
    const ledgerClient = createMockLedgerClient();
    const validatorClient = createMockValidatorClient();
    validatorClient.getExternalPartyBalance.mockRejectedValueOnce(new ApiError('not found', 404));
    ledgerClient.getActiveContracts.mockResolvedValueOnce([
      {
        contractEntry: {
          JsActiveContract: {
            createdEvent: {
              contractId: 'amulet-1',
              templateId: 'pkg:Splice.Amulet:Amulet',
              createArgument: {
                owner: fixture.partyId,
                amount: { initialAmount: '1.25' },
              },
            },
          },
        },
      },
      {
        contractEntry: {
          JsActiveContract: {
            createdEvent: {
              contractId: 'amulet-2',
              templateId: 'pkg:Splice.Amulet:Amulet',
              createArgument: {
                owner: fixture.partyId,
                amount: { initialAmount: '2.75' },
              },
            },
          },
        },
      },
    ] as never);
    const bridge = createBridge({ ledgerClient, validatorClient });

    await expect(bridge.getExternalPartyBalance({ partyId: fixture.partyId })).resolves.toEqual({
      partyId: fixture.partyId,
      fetchedAt: '2026-05-28T20:26:40.000Z',
      raw: {
        source: 'ledger-active-contracts',
        reason: 'validator-external-party-wallet-not-found',
        effective_unlocked_qty: '4.00',
        effective_locked_qty: '0',
        contracts: [
          {
            contractId: 'amulet-1',
            templateId: 'pkg:Splice.Amulet:Amulet',
            amount: '1.25',
          },
          {
            contractId: 'amulet-2',
            templateId: 'pkg:Splice.Amulet:Amulet',
            amount: '2.75',
          },
        ],
      },
    });
  });

  it('parses a single connected synchronizer and rejects ambiguous provider state', (): void => {
    expect(
      parseExternalPartyWalletConnectedSynchronizerId({
        connectedSynchronizers: [` ${SYNCHRONIZER_ID} `, { synchronizerId: SYNCHRONIZER_ID }],
      })
    ).toBe(SYNCHRONIZER_ID);

    expect(() =>
      parseExternalPartyWalletConnectedSynchronizerId({
        connectedSynchronizers: [{ synchronizerId: SYNCHRONIZER_ID }, { synchronizerId: 'other-domain::sync' }],
      })
    ).toThrow('Canton provider reported multiple connected synchronizers');
  });

  it('uses canonical prepare-token payloads so callers can verify prebuilt values', async (): Promise<void> => {
    const fixture = createSigningFixture();
    const bridge = createBridge();
    const prepared = await bridge.prepareCcTransfer({
      senderPartyId: fixture.partyId,
      receiverPartyId: 'receiver::fingerprint',
      amount: '1',
      publicKeyBase64: fixture.publicKeyBase64,
      tokenContext: { nested: { b: 2, a: 1 } },
    });

    expect(prepared.prepareToken).toEqual(
      buildCantonPrepareToken('prepare-token-secret', {
        kind: 'external-party-cc-transfer',
        version: 1,
        provider: '5n',
        network: 'devnet',
        context: { nested: { b: 2, a: 1 } },
        senderPartyId: fixture.partyId,
        receiverPartyId: 'receiver::fingerprint',
        amount: '1',
        description: null,
        publicKeyFingerprint: fixture.publicKeyFingerprint,
        preparedTransactionSha256: hashPreparedTransaction('prepared-cc-transfer'),
        preparedTransactionHashHex: PREPARED_TRANSACTION_HASH_HEX,
        transferCommandContractIdPrefix: 'transfer-command-prefix',
        nonce: 3,
        expiresAt: prepared.expiresAt,
      })
    );
  });
});
