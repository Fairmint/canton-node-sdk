import { generateKeyPairSync, sign } from 'node:crypto';
import type { LedgerJsonApiClient } from '../../../src/clients/ledger-json-api';
import type { ValidatorApiClient } from '../../../src/clients/validator-api';
import {
  CANTON_TRANSFER_OFFER_TEMPLATE_ID,
  prepareExternalPartyTransferOfferAcceptance,
  readTransferOfferDisclosedContractFromActiveContracts,
  readTransferOfferDisclosedContractFromList,
  submitExternalPartyTransferOfferAcceptance,
  type CantonDisclosedContract,
} from '../../../src/utils/amulet/external-party-transfer-offer';
import {
  buildExternalPartyId,
  deriveCantonEd25519PublicKeyFingerprint,
} from '../../../src/utils/external-signing/canton-protocol';

const PREPARED_TRANSACTION_HASH_HEX = `1220${'22'.repeat(32)}`;

const createSigningFixture = (): {
  readonly publicKeyBase64: string;
  readonly publicKeyFingerprint: string;
  readonly partyId: string;
  readonly signPreparedHash: () => string;
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
    signPreparedHash: () =>
      sign(null, Buffer.from(PREPARED_TRANSACTION_HASH_HEX, 'hex'), privateKey).toString('base64'),
  };
};

const offerContract: CantonDisclosedContract = {
  contractId: 'offer-contract-1',
  templateId: CANTON_TRANSFER_OFFER_TEMPLATE_ID,
  createdEventBlob: 'created-event-blob',
  synchronizerId: 'global-domain::sync',
};

const createMockLedgerClient = (): jest.Mocked<LedgerJsonApiClient> =>
  ({
    getConnectedSynchronizers: jest.fn().mockResolvedValue({
      connectedSynchronizers: [{ synchronizerId: 'global-domain::sync' }],
    }),
    getActiveContracts: jest.fn().mockResolvedValue([]),
    interactiveSubmissionPrepare: jest.fn().mockResolvedValue({
      preparedTransaction: 'prepared-transaction-base64',
      preparedTransactionHash: Buffer.from(PREPARED_TRANSACTION_HASH_HEX, 'hex').toString('base64'),
      hashingSchemeVersion: 'HASHING_SCHEME_VERSION_V2',
    }),
    getApiUrl: jest.fn().mockReturnValue('https://ledger.example.test'),
    makePostRequest: jest.fn().mockResolvedValue({ updateId: 'update-123' }),
  }) as unknown as jest.Mocked<LedgerJsonApiClient>;

const createMockValidatorClient = (): jest.Mocked<ValidatorApiClient> =>
  ({
    listTransferOffers: jest.fn().mockResolvedValue({
      offers: [
        {
          transfer_offer: {
            contract: {
              contract_id: offerContract.contractId,
              template_id: offerContract.templateId,
              created_event_blob: offerContract.createdEventBlob,
              synchronizer_id: offerContract.synchronizerId,
            },
          },
        },
      ],
    }),
  }) as unknown as jest.Mocked<ValidatorApiClient>;

describe('external-party transfer-offer helpers', () => {
  it('reads disclosed contracts from validator transfer-offer list responses', () => {
    expect(
      readTransferOfferDisclosedContractFromList(
        {
          offers: [
            {
              transfer_offer: {
                contract: {
                  contract_id: offerContract.contractId,
                  created_event_blob: offerContract.createdEventBlob,
                },
              },
            },
          ],
        },
        offerContract.contractId,
        offerContract.synchronizerId
      )
    ).toEqual({
      contract: offerContract,
      raw: {
        source: 'validator-transfer-offers',
        contract: expect.any(Object) as object,
      },
    });
  });

  it('does not merge validator transfer-offer disclosure fields across different records', () => {
    expect(
      readTransferOfferDisclosedContractFromList(
        {
          offers: [
            {
              contract_id: offerContract.contractId,
              contract: {
                contract_id: 'different-offer-contract',
                created_event_blob: 'wrong-created-event-blob',
                synchronizer_id: 'wrong-synchronizer',
              },
            },
            {
              transfer_offer: {
                contract: {
                  contract_id: offerContract.contractId,
                  created_event_blob: offerContract.createdEventBlob,
                },
              },
            },
          ],
        },
        offerContract.contractId,
        offerContract.synchronizerId
      )
    ).toEqual({
      contract: offerContract,
      raw: {
        source: 'validator-transfer-offers',
        contract: expect.any(Object) as object,
      },
    });
  });

  it('reads disclosed contracts from Ledger active-contract responses', () => {
    expect(
      readTransferOfferDisclosedContractFromActiveContracts(
        [
          {
            contractEntry: {
              JsActiveContract: {
                createdEvent: {
                  contractId: offerContract.contractId,
                  templateId: offerContract.templateId,
                },
                synchronizerId: offerContract.synchronizerId,
              },
            },
          },
          {
            contractEntry: {
              JsActiveContract: {
                createdEvent: {
                  contractId: offerContract.contractId,
                  templateId: offerContract.templateId,
                  createdEventBlob: offerContract.createdEventBlob,
                },
                synchronizerId: offerContract.synchronizerId,
              },
            },
          },
        ],
        offerContract.contractId
      )
    ).toEqual({
      contract: offerContract,
      raw: {
        source: 'ledger-active-contracts',
        contract: expect.any(Object) as object,
      },
    });
  });

  it('prepares TransferOffer_Accept with the offer disclosed contract', async () => {
    const fixture = createSigningFixture();
    const ledgerClient = createMockLedgerClient();
    const validatorClient = createMockValidatorClient();

    const prepared = await prepareExternalPartyTransferOfferAcceptance({
      ledgerClient,
      validatorClient,
      providerPartyId: 'provider::fingerprint',
      userId: 'user-5n',
      acceptingPartyId: fixture.partyId,
      offerContractId: offerContract.contractId,
      commandId: 'accept-offer-command',
    });

    expect(ledgerClient.getConnectedSynchronizers).toHaveBeenCalledWith({ party: 'provider::fingerprint' });
    expect(validatorClient.listTransferOffers).toHaveBeenCalledTimes(1);
    expect(ledgerClient.interactiveSubmissionPrepare).toHaveBeenCalledWith({
      commands: [
        {
          ExerciseCommand: {
            templateId: CANTON_TRANSFER_OFFER_TEMPLATE_ID,
            contractId: offerContract.contractId,
            choice: 'TransferOffer_Accept',
            choiceArgument: {},
          },
        },
      ],
      commandId: 'accept-offer-command',
      userId: 'user-5n',
      actAs: [fixture.partyId],
      readAs: [fixture.partyId],
      disclosedContracts: [offerContract],
      synchronizerId: offerContract.synchronizerId,
      verboseHashing: false,
      packageIdSelectionPreference: [],
    });
    expect(prepared).toMatchObject({
      offerContractId: offerContract.contractId,
      acceptingPartyId: fixture.partyId,
      commandId: 'accept-offer-command',
      synchronizerId: offerContract.synchronizerId,
      preparedTransaction: 'prepared-transaction-base64',
      preparedTransactionHashHex: PREPARED_TRANSACTION_HASH_HEX,
      hashingSchemeVersion: 'HASHING_SCHEME_VERSION_V2',
    });
  });

  it('falls back to Ledger active contracts when validator transfer-offer disclosure is unavailable', async () => {
    const fixture = createSigningFixture();
    const ledgerClient = createMockLedgerClient();
    const validatorClient = createMockValidatorClient();
    validatorClient.listTransferOffers.mockRejectedValueOnce(new Error('validator unavailable'));
    ledgerClient.getActiveContracts.mockResolvedValueOnce([
      {
        contractEntry: {
          JsActiveContract: {
            createdEvent: {
              contractId: offerContract.contractId,
              templateId: offerContract.templateId,
              createdEventBlob: offerContract.createdEventBlob,
            },
            synchronizerId: offerContract.synchronizerId,
          },
        },
      },
    ] as never);

    await prepareExternalPartyTransferOfferAcceptance({
      ledgerClient,
      validatorClient,
      providerPartyId: 'provider::fingerprint',
      userId: 'user-5n',
      acceptingPartyId: fixture.partyId,
      offerContractId: offerContract.contractId,
    });

    expect(ledgerClient.getActiveContracts).toHaveBeenCalledWith({
      parties: ['provider::fingerprint'],
      templateIds: [CANTON_TRANSFER_OFFER_TEMPLATE_ID],
      includeCreatedEventBlob: true,
    });
  });

  it('rejects ambiguous provider synchronizers before preparing', async () => {
    const fixture = createSigningFixture();
    const ledgerClient = createMockLedgerClient();
    ledgerClient.getConnectedSynchronizers.mockResolvedValueOnce({
      connectedSynchronizers: [{ synchronizerId: 'sync-1' }, { synchronizerId: 'sync-2' }],
    } as never);

    await expect(
      prepareExternalPartyTransferOfferAcceptance({
        ledgerClient,
        providerPartyId: 'provider::fingerprint',
        userId: 'user-5n',
        acceptingPartyId: fixture.partyId,
        offerContractId: offerContract.contractId,
        disclosedContract: offerContract,
      })
    ).rejects.toThrow('multiple connected synchronizers');

    expect(ledgerClient.interactiveSubmissionPrepare).not.toHaveBeenCalled();
  });

  it('rejects caller-provided disclosures that do not match the requested offer', async () => {
    const fixture = createSigningFixture();
    const ledgerClient = createMockLedgerClient();

    await expect(
      prepareExternalPartyTransferOfferAcceptance({
        ledgerClient,
        providerPartyId: 'provider::fingerprint',
        userId: 'user-5n',
        acceptingPartyId: fixture.partyId,
        offerContractId: offerContract.contractId,
        disclosedContract: {
          ...offerContract,
          contractId: 'different-offer-contract',
        },
      })
    ).rejects.toThrow('contract ID does not match offerContractId');

    await expect(
      prepareExternalPartyTransferOfferAcceptance({
        ledgerClient,
        providerPartyId: 'provider::fingerprint',
        userId: 'user-5n',
        acceptingPartyId: fixture.partyId,
        offerContractId: offerContract.contractId,
        disclosedContract: {
          ...offerContract,
          synchronizerId: 'different-synchronizer',
        },
      })
    ).rejects.toThrow('synchronizer does not match the provider synchronizer');

    expect(ledgerClient.interactiveSubmissionPrepare).not.toHaveBeenCalled();
  });

  it('submits a signed TransferOffer_Accept through executeAndWait and returns the update id', async () => {
    const fixture = createSigningFixture();
    const ledgerClient = createMockLedgerClient();

    const submitted = await submitExternalPartyTransferOfferAcceptance({
      ledgerClient,
      userId: 'user-5n',
      acceptingPartyId: fixture.partyId,
      publicKeyBase64: fixture.publicKeyBase64,
      preparedTransaction: 'prepared-transaction-base64',
      preparedTransactionHashHex: PREPARED_TRANSACTION_HASH_HEX,
      signatureBase64: fixture.signPreparedHash(),
      submissionId: 'submission-123',
    });

    expect(ledgerClient.makePostRequest.mock.calls).toEqual([
      [
        'https://ledger.example.test/v2/interactive-submission/executeAndWait',
        {
          userId: 'user-5n',
          preparedTransaction: 'prepared-transaction-base64',
          hashingSchemeVersion: 'HASHING_SCHEME_VERSION_V2',
          submissionId: 'submission-123',
          deduplicationPeriod: {
            DeduplicationDuration: {
              value: { duration: '30s' },
            },
          },
          partySignatures: {
            signatures: [
              {
                party: fixture.partyId,
                signatures: [
                  {
                    signature: expect.any(String) as string,
                    signedBy: fixture.publicKeyFingerprint,
                    format: 'SIGNATURE_FORMAT_RAW',
                    signingAlgorithmSpec: 'SIGNING_ALGORITHM_SPEC_ED25519',
                  },
                ],
              },
            ],
          },
        },
        {
          contentType: 'application/json',
          includeBearerToken: true,
        },
      ],
    ]);
    expect(submitted).toEqual({
      acceptingPartyId: fixture.partyId,
      updateId: 'update-123',
      raw: { updateId: 'update-123' },
    });
  });

  it('does not submit when the signature is not from the accepting party key', async () => {
    const fixture = createSigningFixture();
    const otherFixture = createSigningFixture();
    const ledgerClient = createMockLedgerClient();

    await expect(
      submitExternalPartyTransferOfferAcceptance({
        ledgerClient,
        userId: 'user-5n',
        acceptingPartyId: fixture.partyId,
        publicKeyBase64: fixture.publicKeyBase64,
        preparedTransaction: 'prepared-transaction-base64',
        preparedTransactionHashHex: PREPARED_TRANSACTION_HASH_HEX,
        signatureBase64: otherFixture.signPreparedHash(),
      })
    ).rejects.toThrow('Invalid Canton hash signature');

    expect(ledgerClient.makePostRequest.mock.calls).toHaveLength(0);
  });
});
