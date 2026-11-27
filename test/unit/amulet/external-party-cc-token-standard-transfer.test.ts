import { buildExternalPartyId, fingerprintEd25519PublicKey } from '@fairmint/canton-protocol/party';
import { generateKeyPairSync, sign } from 'node:crypto';
import type { LedgerJsonApiClient } from '../../../src/clients/ledger-json-api';
import type { JsGetActiveContractsResponseItem } from '../../../src/clients/ledger-json-api/schemas';
import type { ValidatorApiClient } from '../../../src/clients/validator-api';
import { ValidationError } from '../../../src/core/errors';
import {
  CcTokenStandardTransferRefusal,
  prepareExternalPartyCcTokenStandardTransfer,
  submitExternalPartyCcTokenStandardTransfer,
  type PrepareExternalPartyCcTokenStandardTransferOptions,
} from '../../../src/utils/amulet/external-party-cc-token-standard-transfer';
import { CANTON_ED25519_SIGNATURE_ALGORITHM, CANTON_RAW_SIGNATURE_FORMAT } from '../../../src/utils/external-signing';
import {
  TOKEN_STANDARD_V1_REASON_META_KEY,
  TOKEN_STANDARD_V1_TRANSFER_FACTORY_INTERFACE_ID,
} from '../../../src/utils/token-standard';

const DSO = 'DSO::1220dso';
const SYNCHRONIZER_ID = 'global-domain::1220sync';
const RECEIVER = 'receiver::1220receiver';
const FACTORY_ID = '00amulet-rules';
const PREPARED_HASH_HEX = `1220${'33'.repeat(32)}`;
const PREPARED_HASH_BASE64 = Buffer.from(PREPARED_HASH_HEX, 'hex').toString('base64');
const NOW_MS = Date.parse('2026-11-24T12:00:00.000Z');

const createSender = (): {
  readonly partyId: string;
  readonly publicKeyBase64: string;
  readonly publicKeyFingerprint: string;
  readonly signHash: () => string;
} => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const publicKeyBase64 = Buffer.from(publicKey.export({ format: 'der', type: 'spki' }))
    .subarray(-32)
    .toString('base64');
  const publicKeyFingerprint = fingerprintEd25519PublicKey(publicKeyBase64);
  return {
    partyId: buildExternalPartyId('sender', publicKeyFingerprint),
    publicKeyBase64,
    publicKeyFingerprint,
    signHash: (): string => sign(null, Buffer.from(PREPARED_HASH_HEX, 'hex'), privateKey).toString('base64'),
  };
};

const amuletHolding = (params: {
  readonly contractId: string;
  readonly owner: string;
  readonly amount: string;
  readonly locked?: boolean;
  readonly signatories?: readonly string[];
  readonly synchronizerId?: string;
}): JsGetActiveContractsResponseItem => ({
  contractEntry: {
    JsActiveContract: {
      synchronizerId: params.synchronizerId ?? SYNCHRONIZER_ID,
      reassignmentCounter: 0,
      createdEvent: {
        offset: 1,
        nodeId: 1,
        contractId: params.contractId,
        templateId: params.locked ? '#splice-amulet:Splice.Amulet:LockedAmulet' : '#splice-amulet:Splice.Amulet:Amulet',
        contractKey: null,
        createArgument: {},
        createdEventBlob: '',
        interfaceViews: [
          {
            interfaceId: '#splice-api-token-holding-v1:Splice.Api.Token.HoldingV1:Holding',
            viewStatus: { code: 0, message: '' },
            viewValue: {
              owner: params.owner,
              instrumentId: { admin: DSO, id: 'Amulet' },
              amount: params.amount,
              lock: params.locked
                ? { holders: [DSO], expiresAt: '2026-11-25T00:00:00Z', expiresAfter: null, context: 'transfer' }
                : null,
              meta: { values: {} },
            },
          },
        ],
        witnessParties: [params.owner],
        signatories: [...(params.signatories ?? [DSO, params.owner])],
        observers: [],
        createdAt: '2026-11-20T00:00:00.000Z',
        packageName: 'splice-amulet',
        implementedInterfaces: ['#splice-api-token-holding-v1:Splice.Api.Token.HoldingV1:Holding'],
      },
    },
  },
});

const transferFactoryResponse = (
  overrides: {
    readonly transferKind?: 'direct' | 'offer' | 'self';
    readonly contextValues?: Record<string, unknown>;
    readonly disclosedSynchronizerId?: string;
  } = {}
): unknown => ({
  factoryId: FACTORY_ID,
  transferKind: overrides.transferKind ?? 'direct',
  choiceContext: {
    choiceContextData: {
      values: overrides.contextValues ?? {
        'amulet-rules': { tag: 'AV_ContractId', value: FACTORY_ID },
        'open-round': { tag: 'AV_ContractId', value: '00open-round' },
        'transfer-preapproval': { tag: 'AV_ContractId', value: '00preapproval' },
      },
    },
    disclosedContracts: [
      {
        templateId: 'pkg:Splice.AmuletRules:AmuletRules',
        contractId: FACTORY_ID,
        createdEventBlob: 'amulet-rules-blob',
        synchronizerId: overrides.disclosedSynchronizerId ?? SYNCHRONIZER_ID,
        debugPackageName: 'splice-amulet',
        debugPayload: { dso: DSO },
        debugCreatedAt: '2026-11-01T00:00:00Z',
      },
      {
        templateId: 'pkg:Splice.Round:OpenMiningRound',
        contractId: '00open-round',
        createdEventBlob: 'open-round-blob',
        synchronizerId: SYNCHRONIZER_ID,
        // What a LocalNet registry sends with excludeDebugFields.
        debugPackageName: null,
        debugPayload: null,
        debugCreatedAt: null,
      },
    ],
  },
});

const createLedgerClient = (holdings: readonly JsGetActiveContractsResponseItem[]): jest.Mocked<LedgerJsonApiClient> =>
  ({
    getConnectedSynchronizers: jest.fn().mockResolvedValue({
      connectedSynchronizers: [
        {
          synchronizerId: SYNCHRONIZER_ID,
          synchronizerAlias: 'global',
          permission: 'PARTICIPANT_PERMISSION_CONFIRMATION',
        },
      ],
    }),
    getLedgerEnd: jest.fn().mockResolvedValue({ offset: 4242 }),
    getActiveContracts: jest.fn().mockResolvedValue([...holdings]),
    interactiveSubmissionPrepare: jest.fn().mockResolvedValue({
      preparedTransaction: 'prepared-cc-transfer',
      preparedTransactionHash: PREPARED_HASH_BASE64,
      hashingSchemeVersion: 'HASHING_SCHEME_VERSION_V2',
      hashingDetails: 'hashing details',
    }),
    interactiveSubmissionExecuteAndWait: jest.fn().mockResolvedValue({
      updateId: 'cc-transfer-update-1',
      completionOffset: 4300,
    }),
  }) as unknown as jest.Mocked<LedgerJsonApiClient>;

const createValidatorClient = (factoryResponse: unknown = transferFactoryResponse()): jest.Mocked<ValidatorApiClient> =>
  ({
    getDsoPartyId: jest.fn().mockResolvedValue({ dso_party_id: DSO }),
    getTransferFactory: jest.fn().mockResolvedValue(factoryResponse),
    prepareTransferPreapprovalSend: jest.fn(),
    submitTransferPreapprovalSend: jest.fn(),
  }) as unknown as jest.Mocked<ValidatorApiClient>;

const prepareOptions = (
  senderPartyId: string,
  ledgerClient: LedgerJsonApiClient,
  validatorClient: ValidatorApiClient,
  overrides: Partial<PrepareExternalPartyCcTokenStandardTransferOptions> = {}
): PrepareExternalPartyCcTokenStandardTransferOptions => ({
  ledgerClient,
  validatorClient,
  userId: 'provider-user',
  senderPartyId,
  receiverPartyId: RECEIVER,
  amount: '2.5',
  description: 'demo transfer',
  commandId: 'cc-transfer-command-1',
  now: (): number => NOW_MS,
  ...overrides,
});

interface PreparedCall {
  readonly commands: ReadonlyArray<{
    readonly ExerciseCommand: {
      readonly templateId: string;
      readonly contractId: string;
      readonly choice: string;
      readonly choiceArgument: {
        readonly expectedAdmin: string;
        readonly transfer: Record<string, unknown>;
        readonly extraArgs: { readonly context: unknown; readonly meta: unknown };
      };
    };
  }>;
  readonly [key: string]: unknown;
}

const firstPrepareCall = (ledgerClient: jest.Mocked<LedgerJsonApiClient>): PreparedCall => {
  const call = ledgerClient.interactiveSubmissionPrepare.mock.calls[0];
  if (!call) throw new Error('interactiveSubmissionPrepare was not called');
  return call[0] as unknown as PreparedCall;
};

const nonCanonicalSpellings = (signatureBase64: string): ReadonlyArray<readonly [string, string]> => [
  ['unpadded', signatureBase64.replace(/=+$/, '')],
  ['base64url', signatureBase64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')],
  ['whitespace-padded', ` ${signatureBase64}\n`],
];

describe('external-party CC token-standard transfer', () => {
  it('prepares TransferFactory_Transfer with the covering unlocked holdings, the registry context and the sender only', async () => {
    const sender = createSender();
    const ledgerClient = createLedgerClient([
      amuletHolding({ contractId: '00small', owner: sender.partyId, amount: '1.0000000000' }),
      amuletHolding({ contractId: '00large', owner: sender.partyId, amount: '2.0000000000' }),
      amuletHolding({ contractId: '00locked', owner: sender.partyId, amount: '100.0000000000', locked: true }),
      amuletHolding({ contractId: '00other-owner', owner: 'other::1220other', amount: '100.0000000000' }),
      amuletHolding({
        contractId: '00other-sync',
        owner: sender.partyId,
        amount: '100.0000000000',
        synchronizerId: 'other::sync',
      }),
    ]);
    const validatorClient = createValidatorClient();

    const prepared = await prepareExternalPartyCcTokenStandardTransfer(
      prepareOptions(sender.partyId, ledgerClient, validatorClient)
    );

    const expectedTransfer = {
      sender: sender.partyId,
      receiver: RECEIVER,
      amount: '2.5',
      instrumentId: { admin: DSO, id: 'Amulet' },
      requestedAt: '2026-11-24T11:59:00.000Z',
      executeBefore: '2026-11-24T12:10:00.000Z',
      inputHoldingCids: ['00large', '00small'],
      meta: { values: { [TOKEN_STANDARD_V1_REASON_META_KEY]: 'demo transfer' } },
    };
    expect(ledgerClient.getConnectedSynchronizers).toHaveBeenCalledWith({ party: sender.partyId });
    expect(ledgerClient.getActiveContracts).toHaveBeenCalledWith(
      expect.objectContaining({ parties: [sender.partyId], activeAtOffset: 4242 })
    );
    expect(validatorClient.getTransferFactory).toHaveBeenCalledWith({
      choiceArguments: {
        expectedAdmin: DSO,
        transfer: expectedTransfer,
        extraArgs: { context: { values: {} }, meta: { values: {} } },
      },
      excludeDebugFields: true,
    });

    const request = firstPrepareCall(ledgerClient);
    expect(request).toMatchObject({
      commandId: 'cc-transfer-command-1',
      userId: 'provider-user',
      actAs: [sender.partyId],
      readAs: [sender.partyId],
      synchronizerId: SYNCHRONIZER_ID,
      hashingSchemeVersion: 'HASHING_SCHEME_VERSION_V2',
      verboseHashing: false,
      packageIdSelectionPreference: [],
    });
    // Debug fields are diagnostics and are not sent to the participant.
    expect(request['disclosedContracts']).toEqual([
      {
        templateId: 'pkg:Splice.AmuletRules:AmuletRules',
        contractId: FACTORY_ID,
        createdEventBlob: 'amulet-rules-blob',
        synchronizerId: SYNCHRONIZER_ID,
      },
      {
        templateId: 'pkg:Splice.Round:OpenMiningRound',
        contractId: '00open-round',
        createdEventBlob: 'open-round-blob',
        synchronizerId: SYNCHRONIZER_ID,
      },
    ]);
    const [command] = request.commands;
    expect(command?.ExerciseCommand.templateId).toBe(TOKEN_STANDARD_V1_TRANSFER_FACTORY_INTERFACE_ID);
    expect(command?.ExerciseCommand.contractId).toBe(FACTORY_ID);
    expect(command?.ExerciseCommand.choice).toBe('TransferFactory_Transfer');
    expect(JSON.parse(JSON.stringify(command?.ExerciseCommand.choiceArgument))).toEqual({
      expectedAdmin: DSO,
      transfer: expectedTransfer,
      extraArgs: {
        context: {
          values: {
            'amulet-rules': { tag: 'AV_ContractId', value: FACTORY_ID },
            'open-round': { tag: 'AV_ContractId', value: '00open-round' },
            'transfer-preapproval': { tag: 'AV_ContractId', value: '00preapproval' },
          },
        },
        meta: { values: {} },
      },
    });

    expect(prepared).toEqual({
      senderPartyId: sender.partyId,
      receiverPartyId: RECEIVER,
      amount: '2.5',
      commandId: 'cc-transfer-command-1',
      synchronizerId: SYNCHRONIZER_ID,
      transferKind: 'direct',
      instrumentAdmin: DSO,
      inputHoldingCids: ['00large', '00small'],
      requestedAt: '2026-11-24T11:59:00.000Z',
      executeBefore: '2026-11-24T12:10:00.000Z',
      preparedTransaction: 'prepared-cc-transfer',
      preparedTransactionHashHex: PREPARED_HASH_HEX,
      hashingSchemeVersion: 'HASHING_SCHEME_VERSION_V2',
      hashingDetails: 'hashing details',
      raw: expect.objectContaining({ preparedTransaction: 'prepared-cc-transfer' }) as object,
    });
  });

  it('omits the reason when there is no description and skips the DSO lookup when given', async () => {
    const sender = createSender();
    const ledgerClient = createLedgerClient([
      amuletHolding({ contractId: '00one', owner: sender.partyId, amount: '10.0' }),
    ]);
    const validatorClient = createValidatorClient();

    await prepareExternalPartyCcTokenStandardTransfer(
      prepareOptions(sender.partyId, ledgerClient, validatorClient, { description: '  ', dsoPartyId: DSO })
    );

    expect(validatorClient.getDsoPartyId).not.toHaveBeenCalled();
    const [command] = firstPrepareCall(ledgerClient).commands;
    expect(command?.ExerciseCommand.choiceArgument.transfer['meta']).toEqual({ values: {} });
  });

  it('takes the largest holdings first and stops once they cover the amount', async () => {
    const sender = createSender();
    const ledgerClient = createLedgerClient([
      amuletHolding({ contractId: '00a', owner: sender.partyId, amount: '1.0' }),
      amuletHolding({ contractId: '00b', owner: sender.partyId, amount: '3.0' }),
      amuletHolding({ contractId: '00c', owner: sender.partyId, amount: '2.0' }),
    ]);

    const prepared = await prepareExternalPartyCcTokenStandardTransfer(
      prepareOptions(sender.partyId, ledgerClient, createValidatorClient())
    );

    expect(prepared.inputHoldingCids).toEqual(['00b']);
  });

  it('skips look-alike holdings the DSO did not sign, however large or malformed', async () => {
    const sender = createSender();
    const ledgerClient = createLedgerClient([
      amuletHolding({
        contractId: '00spoof',
        owner: sender.partyId,
        amount: '1000000.0',
        signatories: ['attacker::1220attacker'],
      }),
      amuletHolding({
        contractId: '00owner-only',
        owner: sender.partyId,
        amount: '500000.0',
        signatories: [sender.partyId],
      }),
      amuletHolding({
        contractId: '00malformed',
        owner: sender.partyId,
        amount: '-1.0',
        signatories: ['attacker::1220attacker'],
      }),
      amuletHolding({ contractId: '00real', owner: sender.partyId, amount: '3.0' }),
    ]);

    const prepared = await prepareExternalPartyCcTokenStandardTransfer(
      prepareOptions(sender.partyId, ledgerClient, createValidatorClient())
    );

    expect(prepared.inputHoldingCids).toEqual(['00real']);
  });

  it('caps the input holdings and refuses when the capped holdings do not cover the amount', async () => {
    const sender = createSender();
    const ledgerClient = createLedgerClient([
      amuletHolding({ contractId: '00a', owner: sender.partyId, amount: '1.0' }),
      amuletHolding({ contractId: '00b', owner: sender.partyId, amount: '1.0' }),
      amuletHolding({ contractId: '00c', owner: sender.partyId, amount: '1.0' }),
    ]);

    await expect(
      prepareExternalPartyCcTokenStandardTransfer(
        prepareOptions(sender.partyId, ledgerClient, createValidatorClient(), { maxInputHoldings: 2 })
      )
    ).rejects.toThrow('Insufficient CC balance');
    expect(ledgerClient.interactiveSubmissionPrepare).not.toHaveBeenCalled();
  });

  it.each(['offer', 'self'] as const)(
    'refuses a %s transfer before preparing anything by default',
    async (transferKind) => {
      const sender = createSender();
      const ledgerClient = createLedgerClient([
        amuletHolding({ contractId: '00one', owner: sender.partyId, amount: '10.0' }),
      ]);

      const result = prepareExternalPartyCcTokenStandardTransfer(
        prepareOptions(
          sender.partyId,
          ledgerClient,
          createValidatorClient(transferFactoryResponse({ transferKind, contextValues: {} }))
        )
      );

      await expect(result).rejects.toBeInstanceOf(ValidationError);
      await expect(result).rejects.toMatchObject({
        message: 'Canton CC receiver has no transfer preapproval',
        context: expect.objectContaining({
          reason: CcTokenStandardTransferRefusal.receiverHasNoTransferPreapproval,
          transferKind,
        }) as object,
      });
      expect(ledgerClient.interactiveSubmissionPrepare).not.toHaveBeenCalled();
    }
  );

  it('prepares an offer when the caller allows it', async () => {
    const sender = createSender();
    const ledgerClient = createLedgerClient([
      amuletHolding({ contractId: '00one', owner: sender.partyId, amount: '10.0' }),
    ]);

    const prepared = await prepareExternalPartyCcTokenStandardTransfer(
      prepareOptions(
        sender.partyId,
        ledgerClient,
        createValidatorClient(transferFactoryResponse({ transferKind: 'offer', contextValues: {} })),
        { requirePreapproval: false, executeBefore: '2026-11-25T12:00:00.000Z' }
      )
    );

    expect(prepared.transferKind).toBe('offer');
    expect(prepared.executeBefore).toBe('2026-11-25T12:00:00.000Z');
    expect(ledgerClient.interactiveSubmissionPrepare).toHaveBeenCalledTimes(1);
  });

  it('refuses an offer without an explicit executeBefore, which would also be its 10-minute expiry', async () => {
    const sender = createSender();
    const ledgerClient = createLedgerClient([
      amuletHolding({ contractId: '00one', owner: sender.partyId, amount: '10.0' }),
    ]);

    const result = prepareExternalPartyCcTokenStandardTransfer(
      prepareOptions(
        sender.partyId,
        ledgerClient,
        createValidatorClient(transferFactoryResponse({ transferKind: 'offer', contextValues: {} })),
        { requirePreapproval: false }
      )
    );

    await expect(result).rejects.toBeInstanceOf(ValidationError);
    await expect(result).rejects.toMatchObject({
      context: expect.objectContaining({
        reason: CcTokenStandardTransferRefusal.offerRequiresExplicitExecuteBefore,
        transferKind: 'offer',
        executeBefore: '2026-11-24T12:10:00.000Z',
      }) as object,
    });
    expect(ledgerClient.interactiveSubmissionPrepare).not.toHaveBeenCalled();
  });

  it('keeps the default executeBefore for a self transfer the caller allows', async () => {
    const sender = createSender();
    const ledgerClient = createLedgerClient([
      amuletHolding({ contractId: '00one', owner: sender.partyId, amount: '10.0' }),
    ]);

    const prepared = await prepareExternalPartyCcTokenStandardTransfer(
      prepareOptions(
        sender.partyId,
        ledgerClient,
        createValidatorClient(transferFactoryResponse({ transferKind: 'self', contextValues: {} })),
        { requirePreapproval: false }
      )
    );

    expect(prepared.transferKind).toBe('self');
    expect(prepared.executeBefore).toBe('2026-11-24T12:10:00.000Z');
  });

  it('refuses a direct transfer whose context lacks the transfer preapproval', async () => {
    const sender = createSender();
    const ledgerClient = createLedgerClient([
      amuletHolding({ contractId: '00one', owner: sender.partyId, amount: '10.0' }),
    ]);

    await expect(
      prepareExternalPartyCcTokenStandardTransfer(
        prepareOptions(
          sender.partyId,
          ledgerClient,
          createValidatorClient(
            transferFactoryResponse({ contextValues: { 'amulet-rules': { tag: 'AV_ContractId', value: FACTORY_ID } } })
          )
        )
      )
    ).rejects.toMatchObject({
      context: expect.objectContaining({
        reason: CcTokenStandardTransferRefusal.receiverHasNoTransferPreapproval,
      }) as object,
    });
    expect(ledgerClient.interactiveSubmissionPrepare).not.toHaveBeenCalled();
  });

  it('refuses an amount the unlocked holdings do not cover, before asking the registry', async () => {
    const sender = createSender();
    const ledgerClient = createLedgerClient([
      amuletHolding({ contractId: '00one', owner: sender.partyId, amount: '2.0' }),
      amuletHolding({ contractId: '00locked', owner: sender.partyId, amount: '50.0', locked: true }),
    ]);
    const validatorClient = createValidatorClient();

    await expect(
      prepareExternalPartyCcTokenStandardTransfer(prepareOptions(sender.partyId, ledgerClient, validatorClient))
    ).rejects.toMatchObject({
      name: 'ValidationError',
      message: 'Insufficient CC balance for this transfer',
      context: expect.objectContaining({
        reason: CcTokenStandardTransferRefusal.insufficientBalance,
        amount: '2.5',
        availableAmount: '2',
      }) as object,
    });
    expect(validatorClient.getTransferFactory).not.toHaveBeenCalled();
    expect(ledgerClient.interactiveSubmissionPrepare).not.toHaveBeenCalled();
  });

  it('refuses registry contracts disclosed on another synchronizer', async () => {
    const sender = createSender();
    const ledgerClient = createLedgerClient([
      amuletHolding({ contractId: '00one', owner: sender.partyId, amount: '10.0' }),
    ]);

    await expect(
      prepareExternalPartyCcTokenStandardTransfer(
        prepareOptions(
          sender.partyId,
          ledgerClient,
          createValidatorClient(transferFactoryResponse({ disclosedSynchronizerId: 'other::sync' }))
        )
      )
    ).rejects.toMatchObject({
      context: expect.objectContaining({
        reason: CcTokenStandardTransferRefusal.synchronizerMismatch,
        disclosedSynchronizerId: 'other::sync',
      }) as object,
    });
    expect(ledgerClient.interactiveSubmissionPrepare).not.toHaveBeenCalled();
  });

  it('refuses an invalid registry response', async () => {
    const sender = createSender();
    const ledgerClient = createLedgerClient([
      amuletHolding({ contractId: '00one', owner: sender.partyId, amount: '10.0' }),
    ]);

    await expect(
      prepareExternalPartyCcTokenStandardTransfer(
        prepareOptions(sender.partyId, ledgerClient, createValidatorClient({ factoryId: FACTORY_ID }))
      )
    ).rejects.toThrow('Canton CC registry transfer-factory response was invalid');
  });

  it.each(['0', '0.0', '-1', '1e3', '0x10', '1.00000000001', ''])('refuses amount %p', async (amount) => {
    const sender = createSender();
    const ledgerClient = createLedgerClient([]);

    await expect(
      prepareExternalPartyCcTokenStandardTransfer(
        prepareOptions(sender.partyId, ledgerClient, createValidatorClient(), { amount })
      )
    ).rejects.toBeInstanceOf(ValidationError);
    expect(ledgerClient.getActiveContracts).not.toHaveBeenCalled();
  });

  it('refuses an executeBefore in the past', async () => {
    const sender = createSender();

    await expect(
      prepareExternalPartyCcTokenStandardTransfer(
        prepareOptions(sender.partyId, createLedgerClient([]), createValidatorClient(), {
          executeBefore: '2026-11-24T11:00:00.000Z',
        })
      )
    ).rejects.toThrow('executeBefore must be in the future and after requestedAt');
  });

  it('executes the signed transfer as the sender, signed by its key fingerprint', async () => {
    const sender = createSender();
    const ledgerClient = createLedgerClient([]);
    const signatureBase64 = sender.signHash();

    const submitted = await submitExternalPartyCcTokenStandardTransfer({
      ledgerClient,
      userId: 'provider-user',
      senderPartyId: sender.partyId,
      publicKeyBase64: sender.publicKeyBase64,
      preparedTransaction: 'prepared-cc-transfer',
      preparedTransactionHashHex: PREPARED_HASH_HEX,
      signatureBase64,
      submissionId: 'submission-1',
    });

    expect(ledgerClient.interactiveSubmissionExecuteAndWait).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'provider-user',
        preparedTransaction: 'prepared-cc-transfer',
        hashingSchemeVersion: 'HASHING_SCHEME_VERSION_V2',
        submissionId: 'submission-1',
        partySignatures: {
          signatures: [
            {
              party: sender.partyId,
              signatures: [
                {
                  signature: signatureBase64,
                  signedBy: sender.publicKeyFingerprint,
                  format: CANTON_RAW_SIGNATURE_FORMAT,
                  signingAlgorithmSpec: CANTON_ED25519_SIGNATURE_ALGORITHM,
                },
              ],
            },
          ],
        },
      })
    );
    expect(submitted).toMatchObject({
      senderPartyId: sender.partyId,
      updateId: 'cc-transfer-update-1',
      completionOffset: 4300,
    });
  });

  it.each(['unpadded', 'base64url', 'whitespace-padded'])(
    'verifies a %s signature and executes it as canonical padded base64',
    async (kind) => {
      const sender = createSender();
      const ledgerClient = createLedgerClient([]);
      const canonical = sender.signHash();
      const spelling = nonCanonicalSpellings(canonical).find(([name]) => name === kind)?.[1] ?? canonical;
      expect(spelling).not.toBe(canonical);

      await submitExternalPartyCcTokenStandardTransfer({
        ledgerClient,
        userId: 'provider-user',
        senderPartyId: sender.partyId,
        publicKeyBase64: sender.publicKeyBase64,
        preparedTransaction: 'prepared-cc-transfer',
        preparedTransactionHashHex: PREPARED_HASH_HEX,
        signatureBase64: spelling,
      });

      expect(ledgerClient.interactiveSubmissionExecuteAndWait).toHaveBeenCalledWith(
        expect.objectContaining({
          partySignatures: {
            signatures: [
              {
                party: sender.partyId,
                signatures: [expect.objectContaining({ signature: canonical }) as object],
              },
            ],
          },
        })
      );
    }
  );

  it('refuses a signature that does not verify against the hash, without executing', async () => {
    const sender = createSender();
    const other = createSender();
    const ledgerClient = createLedgerClient([]);

    await expect(
      submitExternalPartyCcTokenStandardTransfer({
        ledgerClient,
        userId: 'provider-user',
        senderPartyId: sender.partyId,
        publicKeyBase64: sender.publicKeyBase64,
        preparedTransaction: 'prepared-cc-transfer',
        preparedTransactionHashHex: PREPARED_HASH_HEX,
        signatureBase64: other.signHash(),
      })
    ).rejects.toThrow('Invalid Canton hash signature');
    expect(ledgerClient.interactiveSubmissionExecuteAndWait).not.toHaveBeenCalled();
  });
});
