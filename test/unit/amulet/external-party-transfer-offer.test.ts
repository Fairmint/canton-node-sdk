import { buildExternalPartyId, fingerprintEd25519PublicKey } from '@fairmint/canton-protocol/party';
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
import { OperationErrorCode } from '../../../src/core/errors';
import {
  buildPreparedTransaction,
  DISHONEST_PREPARE_ANSWERS,
  honestPrepareAnswer,
  type PrepareRequestLike,
} from '../external-signing/fixtures/prepared-transactions';

const SYNCHRONIZER_ID = 'global-domain::sync';

/** The acceptance the honest participant prepares for `acceptingPartyId`, with its hash. */
const preparedAcceptance = async (
  acceptingPartyId: string,
  note?: string
): Promise<{ readonly preparedTransaction: string; readonly hashHex: string }> =>
  buildPreparedTransaction({
    partyId: acceptingPartyId,
    commandId: 'accept-offer-command',
    synchronizerId: SYNCHRONIZER_ID,
    ...(note !== undefined ? { note } : {}),
  });

const createSigningFixture = (): {
  readonly publicKeyBase64: string;
  readonly publicKeyFingerprint: string;
  readonly partyId: string;
  readonly signPreparedHash: (hashHex: string) => string;
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
    signPreparedHash: (hashHex: string) => sign(null, Buffer.from(hashHex, 'hex'), privateKey).toString('base64'),
  };
};

const offerContract: CantonDisclosedContract = {
  contractId: 'offer-contract-1',
  templateId: CANTON_TRANSFER_OFFER_TEMPLATE_ID,
  createdEventBlob: 'created-event-blob',
  synchronizerId: SYNCHRONIZER_ID,
};

const createMockLedgerClient = (): jest.Mocked<LedgerJsonApiClient> =>
  ({
    getConnectedSynchronizers: jest.fn().mockResolvedValue({
      connectedSynchronizers: [{ synchronizerId: SYNCHRONIZER_ID }],
    }),
    getActiveContracts: jest.fn().mockResolvedValue([]),
    // An honest participant: it prepares exactly what was requested.
    interactiveSubmissionPrepare: jest.fn(async (request: PrepareRequestLike) => honestPrepareAnswer(request)),
    interactiveSubmissionExecuteAndWait: jest.fn().mockResolvedValue({
      updateId: 'update-123',
      completionOffset: 456,
    }),
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

  it('ignores validator transfer-offer disclosures from a different synchronizer', () => {
    expect(
      readTransferOfferDisclosedContractFromList(
        {
          offers: [
            {
              transfer_offer: {
                contract: {
                  contract_id: offerContract.contractId,
                  created_event_blob: 'wrong-synchronizer-created-event-blob',
                  synchronizer_id: 'different-synchronizer',
                },
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

  it('ignores Ledger active-contract disclosures from a different synchronizer when expected', () => {
    expect(
      readTransferOfferDisclosedContractFromActiveContracts(
        [
          {
            contractEntry: {
              JsActiveContract: {
                createdEvent: {
                  contractId: offerContract.contractId,
                  templateId: offerContract.templateId,
                  createdEventBlob: 'wrong-synchronizer-created-event-blob',
                },
                synchronizerId: 'different-synchronizer',
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
        offerContract.contractId,
        offerContract.synchronizerId
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
      hashingSchemeVersion: 'HASHING_SCHEME_VERSION_V2',
      verboseHashing: false,
      packageIdSelectionPreference: [],
    });
    const expected = await preparedAcceptance(fixture.partyId);
    expect(prepared).toMatchObject({
      offerContractId: offerContract.contractId,
      acceptingPartyId: fixture.partyId,
      commandId: 'accept-offer-command',
      synchronizerId: offerContract.synchronizerId,
      preparedTransaction: expected.preparedTransaction,
      preparedTransactionHashHex: expected.hashHex,
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
    ).rejects.toThrow('Canton provider reported multiple connected synchronizers');

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
    const acceptance = await preparedAcceptance(fixture.partyId);

    const submitted = await submitExternalPartyTransferOfferAcceptance({
      ledgerClient,
      userId: 'user-5n',
      acceptingPartyId: fixture.partyId,
      publicKeyBase64: fixture.publicKeyBase64,
      preparedTransaction: acceptance.preparedTransaction,
      preparedTransactionHashHex: acceptance.hashHex,
      signatureBase64: fixture.signPreparedHash(acceptance.hashHex),
      submissionId: 'submission-123',
    });

    expect(ledgerClient.interactiveSubmissionExecuteAndWait).toHaveBeenCalledWith({
      userId: 'user-5n',
      preparedTransaction: acceptance.preparedTransaction,
      hashingSchemeVersion: 'HASHING_SCHEME_VERSION_V2',
      submissionId: 'submission-123',
      deduplicationPeriod: {
        DeduplicationDuration: {
          value: { seconds: 600, nanos: 0 },
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
    });
    expect(submitted).toEqual({
      acceptingPartyId: fixture.partyId,
      updateId: 'update-123',
      completionOffset: 456,
      raw: { updateId: 'update-123', completionOffset: 456 },
    });
  });

  it('does not submit when the signature is not from the accepting party key', async () => {
    const fixture = createSigningFixture();
    const otherFixture = createSigningFixture();
    const ledgerClient = createMockLedgerClient();
    const acceptance = await preparedAcceptance(fixture.partyId);

    await expect(
      submitExternalPartyTransferOfferAcceptance({
        ledgerClient,
        userId: 'user-5n',
        acceptingPartyId: fixture.partyId,
        publicKeyBase64: fixture.publicKeyBase64,
        preparedTransaction: acceptance.preparedTransaction,
        preparedTransactionHashHex: acceptance.hashHex,
        signatureBase64: otherFixture.signPreparedHash(acceptance.hashHex),
      })
    ).rejects.toThrow('Invalid Canton hash signature');

    expect(ledgerClient.interactiveSubmissionExecuteAndWait).not.toHaveBeenCalled();
  });

  it("does not submit a signed hash that is not the submitted transaction's", async () => {
    const fixture = createSigningFixture();
    const ledgerClient = createMockLedgerClient();
    const signed = await preparedAcceptance(fixture.partyId);
    const substituted = await preparedAcceptance(fixture.partyId, 'substituted');

    await expect(
      submitExternalPartyTransferOfferAcceptance({
        ledgerClient,
        userId: 'user-5n',
        acceptingPartyId: fixture.partyId,
        publicKeyBase64: fixture.publicKeyBase64,
        preparedTransaction: substituted.preparedTransaction,
        preparedTransactionHashHex: signed.hashHex,
        signatureBase64: fixture.signPreparedHash(signed.hashHex),
      })
    ).rejects.toThrow('preparedTransactionHashHex is not the hash of preparedTransaction');

    expect(ledgerClient.interactiveSubmissionExecuteAndWait).not.toHaveBeenCalled();
  });

  it.each(DISHONEST_PREPARE_ANSWERS)(
    'refuses a participant answer with $name, returning nothing to sign',
    async (dishonest) => {
      const fixture = createSigningFixture();
      const ledgerClient = createMockLedgerClient();
      ledgerClient.interactiveSubmissionPrepare.mockImplementationOnce(async (request) => dishonest.answer(request));

      await expect(
        prepareExternalPartyTransferOfferAcceptance({
          ledgerClient,
          providerPartyId: 'provider::fingerprint',
          userId: 'user-5n',
          acceptingPartyId: fixture.partyId,
          offerContractId: offerContract.contractId,
          disclosedContract: offerContract,
          commandId: 'accept-offer-command',
        })
      ).rejects.toMatchObject({
        code: OperationErrorCode.TRANSACTION_FAILED,
        ...(dishonest.code !== undefined ? { context: { code: dishonest.code, field: dishonest.field } } : {}),
      });
    }
  );
});
