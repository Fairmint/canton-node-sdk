/** End-to-end validation for Ledger JSON API interactive submission response formats. */

import { Keypair } from '@stellar/stellar-base';
import {
  CantonRuntime,
  type LedgerJsonApiClient,
  ValidatorApiClient,
  createExternalPartyWithSigner,
  preparedTransactionHashToHex,
  signHexWithStellarKeypair,
  signWithStellarKeypair,
  stellarPublicKeyToBase64,
  waitForCompletionWithMetadata,
} from '../../../../src';
import type { InteractiveSubmissionExecuteRequest } from '../../../../src/clients/ledger-json-api/schemas/api/interactive-submission';
import { buildIntegrationTestClientConfig, retry } from '../../../utils/testConfig';
import { getClient, resolveWalletAppInstallContext } from './setup';

const APP_INSTALL_REQUEST_TEMPLATE = '#quickstart-licensing:Licensing.AppInstall:AppInstallRequest';
const APP_INSTALL_REQUEST_TEMPLATE_SUFFIX = 'Licensing.AppInstall:AppInstallRequest';
const WALLET_APP_INSTALL_TEMPLATE = '#splice-wallet:Splice.Wallet.Install:WalletAppInstall';

interface PreparedSignedAppInstall {
  readonly request: InteractiveSubmissionExecuteRequest;
  readonly preparedTransactionHashHex: string;
  readonly expectedPayload: {
    readonly provider: string;
    readonly user: string;
    readonly meta: { readonly values: { readonly test: string } };
  };
}

async function resolveLedgerUserId(client: LedgerJsonApiClient, validatorUserName: string): Promise<string> {
  const configured = client.getUserId();
  if (configured) return configured;

  try {
    return (await client.getAuthenticatedUser({})).user.id;
  } catch {
    return validatorUserName;
  }
}

async function resolveSynchronizerId(client: LedgerJsonApiClient, validatorParty: string): Promise<string> {
  const snapshot = await client.getActiveContracts({
    parties: [validatorParty],
    templateIds: [WALLET_APP_INSTALL_TEMPLATE],
  });
  for (const item of snapshot) {
    const entry = item.contractEntry;
    if ('JsActiveContract' in entry && entry.JsActiveContract.createdEvent.templateId.includes('WalletAppInstall')) {
      return entry.JsActiveContract.synchronizerId;
    }
  }
  throw new Error('Could not resolve the LocalNet synchronizer from the validator WalletAppInstall contract');
}

type InteractiveTransactionFormat = NonNullable<
  Parameters<LedgerJsonApiClient['interactiveSubmissionExecuteAndWaitForTransaction']>[0]['transactionFormat']
>;
type LookupTransactionFormat = Parameters<LedgerJsonApiClient['getTransactionById']>[0]['transactionFormat'];
type InteractiveSubmissionTransaction = Awaited<
  ReturnType<LedgerJsonApiClient['interactiveSubmissionExecuteAndWaitForTransaction']>
>['transaction'];
type LookupTransaction = Awaited<ReturnType<LedgerJsonApiClient['getTransactionById']>>['transaction'];

function interactiveTransactionFormatFor(partyId: string): InteractiveTransactionFormat {
  return {
    eventFormat: {
      filtersByParty: {
        [partyId]: {
          cumulative: [
            {
              identifierFilter: {
                WildcardFilter: { value: { includeCreatedEventBlob: true } },
              },
            },
          ],
        },
      },
      verbose: true,
    },
    transactionShape: 'TRANSACTION_SHAPE_ACS_DELTA',
  };
}

function lookupTransactionFormatFor(partyId: string): LookupTransactionFormat {
  return {
    eventFormat: {
      filtersByParty: {
        [partyId]: {
          cumulative: [
            {
              identifierFilter: {
                WildcardFilter: { value: { includeCreatedEventBlob: true } },
              },
            },
          ],
        },
      },
      verbose: true,
    },
    transactionShape: 'TRANSACTION_SHAPE_ACS_DELTA',
  };
}

function expectSubmittedAppInstall(
  transaction: InteractiveSubmissionTransaction | LookupTransaction,
  prepared: PreparedSignedAppInstall
): void {
  expect(transaction.externalTransactionHash).toBe(prepared.preparedTransactionHashHex);
  const createdEvent = transaction.events
    .map((event) => ('CreatedEvent' in event ? event.CreatedEvent : undefined))
    .find((event) => event?.templateId.includes(APP_INSTALL_REQUEST_TEMPLATE_SUFFIX));
  expect(createdEvent).toBeDefined();
  expect(createdEvent?.createArgument).toEqual(prepared.expectedPayload);
}

async function prepareSignedAppInstall(options: {
  readonly client: LedgerJsonApiClient;
  readonly keypair: Keypair;
  readonly externalParty: string;
  readonly publicKeyFingerprint: string;
  readonly validatorParty: string;
  readonly userId: string;
  readonly synchronizerId: string;
  readonly packageId: string;
  readonly label: string;
}): Promise<PreparedSignedAppInstall> {
  const uniqueId = `${options.label}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const expectedPayload = {
    provider: options.validatorParty,
    user: options.externalParty,
    meta: { values: { test: uniqueId } },
  } as const;
  const prepared = await options.client.interactiveSubmissionPrepare({
    userId: options.userId,
    commandId: uniqueId,
    commands: [
      {
        CreateCommand: {
          templateId: APP_INSTALL_REQUEST_TEMPLATE,
          createArguments: expectedPayload,
        },
      },
    ],
    actAs: [options.externalParty],
    synchronizerId: options.synchronizerId,
    packageIdSelectionPreference: [options.packageId],
    estimateTrafficCost: { disabled: true },
    hashingSchemeVersion: 'HASHING_SCHEME_VERSION_V2',
  });
  const preparedTransactionHashHex = preparedTransactionHashToHex(prepared.preparedTransactionHash);

  return {
    preparedTransactionHashHex,
    expectedPayload,
    request: {
      userId: options.userId,
      preparedTransaction: prepared.preparedTransaction,
      partySignatures: {
        signatures: [
          {
            party: options.externalParty,
            signatures: [
              {
                format: 'SIGNATURE_FORMAT_RAW',
                signature: signWithStellarKeypair(options.keypair, Buffer.from(preparedTransactionHashHex, 'hex')),
                signedBy: options.publicKeyFingerprint,
                signingAlgorithmSpec: 'SIGNING_ALGORITHM_SPEC_ED25519',
              },
            ],
          },
        ],
      },
      submissionId: `${uniqueId}-submission`,
      hashingSchemeVersion: prepared.hashingSchemeVersion,
    },
  };
}

describe('LedgerJsonApiClient / Interactive submission', () => {
  test('prepare validates the live endpoint and normalizes nullable response options', async () => {
    const client = getClient();
    const validatorClient = new ValidatorApiClient(new CantonRuntime(buildIntegrationTestClientConfig()));
    const validatorInfo = await validatorClient.getValidatorUserInfo();
    const partyId = validatorInfo.party_id;
    if (!partyId) {
      throw new Error('getValidatorUserInfo returned empty party_id');
    }
    client.setPartyId(partyId);

    const partiesResponse = await client.listParties({});
    const receiverParty = partiesResponse.partyDetails
      .map((entry: { party: string }) => entry.party)
      .find((id: string) => id !== partyId);
    if (!receiverParty) {
      throw new Error(
        'Integration precondition failed: need at least two distinct parties on the ledger (transfer offer cannot use self as receiver)'
      );
    }

    const { contractId: walletInstallCid, synchronizerId } = await resolveWalletAppInstallContext(client, partyId);
    const commandId = `interactive-prepare-it-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const response = await client.interactiveSubmissionPrepare({
      commandId,
      ...(synchronizerId !== undefined ? { synchronizerId } : {}),
      commands: [
        {
          ExerciseCommand: {
            templateId: '#splice-wallet:Splice.Wallet.Install:WalletAppInstall',
            contractId: walletInstallCid,
            choice: 'WalletAppInstall_CreateTransferOffer',
            choiceArgument: {
              receiver: receiverParty,
              amount: { amount: '0.0000001', unit: 'AmuletUnit' },
              description: 'interactive submission prepare integration test',
              expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
              trackingId: commandId,
            },
          },
        },
      ],
      actAs: [partyId],
      verboseHashing: false,
      estimateTrafficCost: { disabled: true },
    });

    expect(response).toEqual({
      preparedTransaction: expect.any(String) as string,
      preparedTransactionHash: expect.any(String) as string,
      hashingSchemeVersion: 'HASHING_SCHEME_VERSION_V2',
    });
    expect(response.preparedTransaction).not.toHaveLength(0);
    expect(response.preparedTransactionHash).not.toHaveLength(0);
  }, 120_000);

  test('externally signed Ed25519 submissions validate every execute variant end to end', async () => {
    const client = getClient();
    const validatorClient = new ValidatorApiClient(new CantonRuntime(buildIntegrationTestClientConfig()));
    const validatorInfo = await validatorClient.getValidatorUserInfo();
    const validatorParty = validatorInfo.party_id;
    const validatorUserName = validatorInfo.user_name;
    if (!validatorParty || !validatorUserName) {
      throw new Error('getValidatorUserInfo did not return both party_id and user_name');
    }
    client.setPartyId(validatorParty);

    const userId = await resolveLedgerUserId(client, validatorUserName);
    const synchronizerId = await resolveSynchronizerId(client, validatorParty);
    const keypair = Keypair.random();
    const external = await createExternalPartyWithSigner({
      ledgerClient: client,
      synchronizerId,
      partyHint: `interactive-e2e-${Date.now()}`,
      publicKeyBase64: stellarPublicKeyToBase64(keypair),
      identityProviderId: '',
      signMultiHash: ({ multiHashHex }) => ({
        signatureHex: signHexWithStellarKeypair(keypair, multiHashHex),
      }),
    });

    await retry(
      async () => {
        const details = await client.getPartyDetails({ party: external.partyId, identityProviderId: '' });
        if (!details.partyDetails.some((party) => party.party === external.partyId)) {
          throw new Error(`Party details did not include ${external.partyId}`);
        }
      },
      { timeoutMs: 120_000, description: 'external party visibility' }
    );

    await client.grantUserRights({
      userId,
      rights: [{ kind: { CanActAs: { value: { party: external.partyId } } } }],
    });

    const preferredVersion = await client.interactiveSubmissionGetPreferredPackageVersion({
      packageName: 'quickstart-licensing',
      parties: [external.partyId],
      synchronizerId,
    });
    const preferredPackages = await client.interactiveSubmissionGetPreferredPackages({
      packageVettingRequirements: [{ packageName: 'quickstart-licensing', parties: [external.partyId] }],
      synchronizerId,
    });
    const packageReference = preferredPackages.packageReferences[0];
    if (!packageReference) {
      throw new Error('preferred-packages returned no quickstart-licensing reference');
    }
    expect(packageReference.packageName).toBe('quickstart-licensing');
    expect(preferredVersion.packagePreference?.packageReference).toEqual(packageReference);

    const asyncPrepared = await prepareSignedAppInstall({
      client,
      keypair,
      externalParty: external.partyId,
      publicKeyFingerprint: external.publicKeyFingerprint,
      validatorParty,
      userId,
      synchronizerId,
      packageId: packageReference.packageId,
      label: 'interactive-async',
    });
    const ledgerEnd = await client.getLedgerEnd({});
    if (ledgerEnd.offset === undefined) {
      throw new Error('getLedgerEnd returned no offset');
    }
    const asyncResult = await client.interactiveSubmissionExecute(asyncPrepared.request);
    expect(asyncResult).toEqual({});
    const completion = await waitForCompletionWithMetadata(client, {
      submissionId: asyncPrepared.request.submissionId,
      partyId: external.partyId,
      userId,
      beginExclusive: ledgerEnd.offset,
      timeoutMs: 120_000,
    });
    const lookupTransactionFormat = lookupTransactionFormatFor(external.partyId);
    const asyncTransaction = await client.getTransactionById({
      updateId: completion.updateId,
      transactionFormat: lookupTransactionFormat,
    });
    expect(asyncTransaction.transaction.updateId).toBe(completion.updateId);
    expectSubmittedAppInstall(asyncTransaction.transaction, asyncPrepared);

    const waitPrepared = await prepareSignedAppInstall({
      client,
      keypair,
      externalParty: external.partyId,
      publicKeyFingerprint: external.publicKeyFingerprint,
      validatorParty,
      userId,
      synchronizerId,
      packageId: packageReference.packageId,
      label: 'interactive-wait',
    });
    const waitResult = await client.interactiveSubmissionExecuteAndWait(waitPrepared.request);
    expect(waitResult.updateId).toMatch(/\S+/);
    expect(waitResult.completionOffset).toBeGreaterThan(0);
    const waitedTransaction = await client.getTransactionById({
      updateId: waitResult.updateId,
      transactionFormat: lookupTransactionFormat,
    });
    expect(waitedTransaction.transaction.updateId).toBe(waitResult.updateId);
    expectSubmittedAppInstall(waitedTransaction.transaction, waitPrepared);

    const transactionPrepared = await prepareSignedAppInstall({
      client,
      keypair,
      externalParty: external.partyId,
      publicKeyFingerprint: external.publicKeyFingerprint,
      validatorParty,
      userId,
      synchronizerId,
      packageId: packageReference.packageId,
      label: 'interactive-transaction',
    });
    const transactionResult = await client.interactiveSubmissionExecuteAndWaitForTransaction({
      ...transactionPrepared.request,
      transactionFormat: interactiveTransactionFormatFor(external.partyId),
    });
    expect(transactionResult.transaction.updateId).toMatch(/\S+/);
    expectSubmittedAppInstall(transactionResult.transaction, transactionPrepared);

    expect(
      new Set([
        asyncPrepared.request.submissionId,
        waitPrepared.request.submissionId,
        transactionPrepared.request.submissionId,
      ]).size
    ).toBe(3);
    expect(
      new Set([
        asyncPrepared.preparedTransactionHashHex,
        waitPrepared.preparedTransactionHashHex,
        transactionPrepared.preparedTransactionHashHex,
      ]).size
    ).toBe(3);
  }, 600_000);
});
