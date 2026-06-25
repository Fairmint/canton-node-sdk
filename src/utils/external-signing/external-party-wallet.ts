import { createHash, randomUUID } from 'node:crypto';
import { type LedgerJsonApiClient } from '../../clients/ledger-json-api';
import { type ValidatorApiClient } from '../../clients/validator-api';
import { ApiError, ConfigurationError, OperationError, OperationErrorCode, ValidationError } from '../../core/errors';
import { isRecord } from '../../core/utils';
import {
  prepareExternalPartyCcTransfer,
  submitExternalPartyCcTransfer,
  type SubmittedExternalPartyCcTransfer,
} from '../amulet/external-party-cc-transfer';
import {
  prepareExternalPartyTransferOfferAcceptance,
  submitExternalPartyTransferOfferAcceptance,
  type PreparedExternalPartyTransferOfferAcceptance,
  type SubmittedExternalPartyTransferOfferAcceptance,
} from '../amulet/external-party-transfer-offer';
import {
  lookupExternalPartyTransferPreapproval,
  prepareExternalPartyTransferPreapprovalSetup,
  sendWalletTransferToPreapprovedParty,
  submitExternalPartyTransferPreapprovalSetup,
  type PreparedExternalPartyTransferPreapprovalSetup,
  type SubmittedExternalPartyTransferPreapprovalSetup,
} from '../amulet/external-party-transfer-preapproval';
import { objectOrEmpty, readRequiredString } from '../canton-response-utils';
import {
  assertCantonHashSignature,
  assertCantonPartyMatchesPublicKey,
  assertCantonPrepareToken,
  assertCantonSha256MultihashHex,
  buildCantonPrepareToken,
  extractRawEd25519PublicKey,
  hashPreparedTransaction,
} from './canton-protocol';
import {
  getExternalPartyIdForHintAndPublicKey,
  listExternalPartyIdsForPublicKey,
  prepareExternalPartyOnboarding,
  submitExternalPartyOnboarding,
} from './external-party-onboarding';

export const DEFAULT_PROVIDER_TRANSFER_OFFER_TTL_MS = 24 * 60 * 60 * 1000;

export interface ExternalPartyWalletOptions {
  readonly ledgerClient: LedgerJsonApiClient;
  readonly validatorClient?: ValidatorApiClient | null;
  readonly providerPartyId: string;
  readonly providerUserId: string;
  readonly prepareTokenSecret: string;
  readonly provider?: string;
  readonly network?: string;
  readonly providerTransferOfferTtlMs?: number;
  readonly now?: () => number;
  readonly randomId?: () => string;
}

export interface ExternalPartyWalletTokenContext {
  readonly provider?: string;
  readonly network?: string;
  readonly userId?: string | null;
  readonly externalUserId?: string | null;
  readonly [key: string]: unknown;
}

export interface PreparedExternalPartyWalletOnboarding {
  readonly partyId: string;
  readonly publicKeyFingerprint: string;
  readonly multiHashHex: string;
  readonly synchronizerId: string;
  readonly topologyTransactions: readonly string[];
  readonly publicKeyFormat: string;
  readonly signingAlgorithmSpec: string;
}

export interface SubmittedExternalPartyWalletOnboarding {
  readonly partyId: string;
  readonly raw: Record<string, unknown>;
  readonly alreadyExisted: boolean;
}

export interface ExternalPartyWalletParties {
  readonly publicKeyFingerprint: string;
  readonly parties: readonly string[];
  readonly raw: unknown;
}

export interface ExternalPartyWalletConnectedSynchronizers {
  readonly synchronizerId: string | null;
  readonly raw: unknown;
}

export interface ExternalPartyWalletProviderBalance {
  readonly sourcePartyId: string;
  readonly fetchedAt: string;
  readonly raw: unknown;
}

export interface PrepareExternalPartyWalletCcTransferInput {
  readonly senderPartyId: string;
  readonly receiverPartyId: string;
  readonly amount: string | number;
  readonly description?: string | null;
  readonly publicKeyBase64: string;
  readonly tokenContext?: ExternalPartyWalletTokenContext;
}

export interface PreparedExternalPartyWalletCcTransfer {
  readonly senderPartyId: string;
  readonly receiverPartyId: string;
  readonly amount: string;
  readonly description: string | null;
  readonly preparedTransaction: string;
  readonly preparedTransactionHashHex: string;
  readonly transferCommandContractIdPrefix: string;
  readonly nonce: number;
  readonly expiresAt: string;
  readonly prepareToken: string;
  readonly hashingDetails: string | null;
}

export interface SubmitExternalPartyWalletCcTransferInput {
  readonly senderPartyId: string;
  readonly receiverPartyId: string;
  readonly amount: string | number;
  readonly description?: string | null;
  readonly publicKeyBase64: string;
  readonly publicKeyFingerprint?: string | null;
  readonly preparedTransaction: string;
  readonly preparedTransactionHashHex: string;
  readonly transferCommandContractIdPrefix: string;
  readonly nonce: number;
  readonly expiresAt: string;
  readonly prepareToken: string;
  readonly signatureBase64: string;
  readonly tokenContext?: ExternalPartyWalletTokenContext;
}

export interface SubmitExternalPartyWalletCcTransferHooks {
  readonly beforeSubmit?: () => Promise<void>;
  readonly afterSubmit?: (result: SubmittedExternalPartyWalletCcTransfer) => Promise<void>;
  readonly afterSubmitWithoutUpdateId?: (result: {
    readonly senderPartyId: string;
    readonly raw: Record<string, unknown>;
  }) => Promise<void>;
  readonly afterSubmitFailure?: (error: unknown) => Promise<void>;
}

export interface SubmittedExternalPartyWalletCcTransfer {
  readonly senderPartyId: string;
  readonly updateId: string;
  readonly raw: Record<string, unknown>;
}

export interface PrepareExternalPartyWalletProviderTransferInput {
  readonly receiverPartyId: string;
  readonly amount: string | number;
  readonly description?: string | null;
  readonly publicKeyBase64: string;
  /**
   * Existing provider-created TransferOffer contract to resume acceptance prepare without creating another funded
   * offer.
   *
   * This is useful when the offer was created but the follow-up interactive prepare failed because the offer disclosure
   * was not visible yet.
   */
  readonly offerContractId?: string;
  readonly offerUpdateId?: string | null;
  readonly commandId?: string;
  readonly tokenContext?: ExternalPartyWalletTokenContext;
}

export interface PreparedExternalPartyWalletProviderTransfer {
  readonly sourcePartyId: string;
  readonly receiverPartyId: string;
  readonly amount: string;
  readonly description: string | null;
  readonly offerContractId: string;
  readonly offerUpdateId: string | null;
  readonly commandId: string;
  readonly synchronizerId: string;
  readonly preparedTransaction: string;
  readonly preparedTransactionHashHex: string;
  readonly hashingSchemeVersion: string;
  readonly prepareToken: string;
  readonly sourceBalanceBefore: unknown;
  readonly sourceBalanceAfter: unknown | null;
  readonly raw: Record<string, unknown>;
}

export interface SubmitExternalPartyWalletProviderTransferInput {
  readonly receiverPartyId: string;
  readonly amount: string | number;
  readonly description?: string | null;
  readonly publicKeyBase64: string;
  readonly publicKeyFingerprint?: string | null;
  readonly offerContractId: string;
  readonly offerUpdateId: string | null;
  readonly commandId: string;
  readonly synchronizerId: string;
  readonly preparedTransaction: string;
  readonly preparedTransactionHashHex: string;
  readonly hashingSchemeVersion?: string;
  readonly prepareToken: string;
  readonly signatureBase64: string;
  readonly tokenContext?: ExternalPartyWalletTokenContext;
}

export interface SubmittedExternalPartyWalletProviderTransfer {
  readonly sourcePartyId: string;
  readonly receiverPartyId: string;
  readonly amount: string;
  readonly description: string | null;
  readonly offerContractId: string;
  readonly offerUpdateId: string | null;
  readonly acceptUpdateId: string;
  readonly updateId: string;
  readonly sourceBalanceAfter: unknown | null;
  readonly raw: Record<string, unknown>;
}

export interface ExternalPartyWalletTransferPreapprovalSetupInput {
  readonly partyId: string;
  readonly publicKeyBase64: string;
  readonly verboseHashing?: boolean;
}

export interface ExternalPartyWalletTransferPreapprovalSubmitInput {
  readonly partyId: string;
  readonly publicKeyBase64: string;
  readonly preparedTransaction: string;
  readonly preparedTransactionHashHex: string;
  readonly signatureBase64: string;
}

export type PreparedExternalPartyWalletTransferPreapprovalSetup = PreparedExternalPartyTransferPreapprovalSetup;

export type SubmittedExternalPartyWalletTransferPreapprovalSetup = SubmittedExternalPartyTransferPreapprovalSetup;

export interface ExternalPartyWalletProviderTransferToPreapprovedInput {
  readonly receiverPartyId: string;
  readonly amount: string | number;
  readonly idempotencyKey: string;
  readonly description?: string | null;
}

export interface ExternalPartyWalletProviderTransferToPreapproved {
  readonly sourcePartyId: string;
  readonly receiverPartyId: string;
  readonly amount: string;
  readonly description: string | null;
  readonly transferPreapprovalContractId: string;
  readonly updateId: string | null;
  readonly sourceBalanceAfter: unknown | null;
  readonly raw: {
    readonly transferPreapproval: unknown;
    readonly transferPreapprovalSend: unknown;
  };
}

export interface ListExternalPartyWalletActiveContractsInput {
  readonly partyId: string;
  readonly templateIds?: readonly string[];
  readonly includeCreatedEventBlob?: boolean;
  readonly limit?: number;
}

export interface ExternalPartyWalletActiveContracts {
  readonly contracts: readonly unknown[];
}

export interface ExternalPartyWalletBalance {
  readonly partyId: string;
  readonly fetchedAt: string;
  readonly raw: unknown;
}

export interface ExternalPartyWalletBridge {
  readonly getConnectedSynchronizers: () => Promise<ExternalPartyWalletConnectedSynchronizers>;
  readonly getProviderSourceBalance: () => Promise<ExternalPartyWalletProviderBalance>;
  readonly listExternalPartiesForPublicKey: (input: {
    readonly publicKeyBase64: string;
    readonly partyName?: string;
  }) => Promise<ExternalPartyWalletParties>;
  readonly prepareExternalParty: (input: {
    readonly partyName: string;
    readonly publicKeyBase64: string;
  }) => Promise<PreparedExternalPartyWalletOnboarding>;
  readonly submitExternalPartySignature: (input: {
    readonly partyId: string;
    readonly publicKeyBase64: string;
    readonly multiHashHex: string;
    readonly synchronizerId: string;
    readonly topologyTransactions: readonly string[];
    readonly multiHashSignatureBase64: string;
    readonly publicKeyFingerprint?: string | null;
  }) => Promise<SubmittedExternalPartyWalletOnboarding>;
  readonly prepareCcTransfer: (
    input: PrepareExternalPartyWalletCcTransferInput
  ) => Promise<PreparedExternalPartyWalletCcTransfer>;
  readonly submitCcTransfer: (
    input: SubmitExternalPartyWalletCcTransferInput,
    hooks?: SubmitExternalPartyWalletCcTransferHooks
  ) => Promise<SubmittedExternalPartyWalletCcTransfer>;
  readonly prepareProviderTransfer: (
    input: PrepareExternalPartyWalletProviderTransferInput
  ) => Promise<PreparedExternalPartyWalletProviderTransfer>;
  readonly submitProviderTransfer: (
    input: SubmitExternalPartyWalletProviderTransferInput
  ) => Promise<SubmittedExternalPartyWalletProviderTransfer>;
  readonly prepareTransferPreapprovalSetup: (
    input: ExternalPartyWalletTransferPreapprovalSetupInput
  ) => Promise<PreparedExternalPartyWalletTransferPreapprovalSetup>;
  readonly submitTransferPreapprovalSetup: (
    input: ExternalPartyWalletTransferPreapprovalSubmitInput
  ) => Promise<SubmittedExternalPartyWalletTransferPreapprovalSetup>;
  readonly sendProviderTransferToPreapprovedParty: (
    input: ExternalPartyWalletProviderTransferToPreapprovedInput
  ) => Promise<ExternalPartyWalletProviderTransferToPreapproved>;
  readonly listActiveContracts: (
    input: ListExternalPartyWalletActiveContractsInput
  ) => Promise<ExternalPartyWalletActiveContracts>;
  readonly getExternalPartyBalance: (input: { readonly partyId: string }) => Promise<ExternalPartyWalletBalance>;
}

interface ProviderTransferOfferForAcceptance {
  readonly offer: unknown;
  readonly offerContractId: string;
  readonly offerStatus: unknown | null;
  readonly offerUpdateId: string | null;
  readonly trackingId: string | null;
}

export function createExternalPartyWalletBridge(options: ExternalPartyWalletOptions): ExternalPartyWalletBridge {
  validateRequiredString('providerPartyId', options.providerPartyId);
  validateRequiredString('providerUserId', options.providerUserId);
  validateRequiredString('prepareTokenSecret', options.prepareTokenSecret);

  const now = options.now ?? Date.now;
  const randomId = options.randomId ?? randomUUID;
  const providerTransferOfferTtlMs = validateProviderTransferOfferTtlMs(
    options.providerTransferOfferTtlMs ?? DEFAULT_PROVIDER_TRANSFER_OFFER_TTL_MS
  );

  return {
    async getConnectedSynchronizers(): Promise<ExternalPartyWalletConnectedSynchronizers> {
      return readConnectedSynchronizers(options.ledgerClient, options.providerPartyId);
    },

    async getProviderSourceBalance(): Promise<ExternalPartyWalletProviderBalance> {
      const validatorClient = requireValidatorClient(options.validatorClient, 'provider source balance');
      return {
        sourcePartyId: options.providerPartyId,
        fetchedAt: new Date(now()).toISOString(),
        raw: await validatorClient.getWalletBalance(),
      };
    },

    async listExternalPartiesForPublicKey(input: {
      readonly publicKeyBase64: string;
      readonly partyName?: string;
    }): Promise<ExternalPartyWalletParties> {
      if (input.partyName) {
        const result = await getExternalPartyIdForHintAndPublicKey(
          options.ledgerClient,
          input.partyName,
          input.publicKeyBase64
        );
        return {
          publicKeyFingerprint: result.publicKeyFingerprint,
          parties: result.exists ? [result.partyId] : [],
          raw: result.raw,
        };
      }
      return listExternalPartyIdsForPublicKey(options.ledgerClient, input.publicKeyBase64);
    },

    async prepareExternalParty(input: {
      readonly partyName: string;
      readonly publicKeyBase64: string;
    }): Promise<PreparedExternalPartyWalletOnboarding> {
      const synchronizerId = await readRequiredConnectedSynchronizerId(options.ledgerClient, options.providerPartyId);
      const prepared = await prepareExternalPartyOnboarding({
        ledgerClient: options.ledgerClient,
        synchronizerId,
        partyHint: input.partyName,
        publicKeyBase64: input.publicKeyBase64,
      });
      return {
        partyId: prepared.partyId,
        publicKeyFingerprint: prepared.publicKeyFingerprint,
        multiHashHex: prepared.multiHashHex,
        synchronizerId: prepared.synchronizerId,
        topologyTransactions: [...prepared.topologyTransactions],
        publicKeyFormat: prepared.publicKeyFormat,
        signingAlgorithmSpec: prepared.signingAlgorithmSpec,
      };
    },

    async submitExternalPartySignature(input: {
      readonly partyId: string;
      readonly publicKeyBase64: string;
      readonly multiHashHex: string;
      readonly synchronizerId: string;
      readonly topologyTransactions: readonly string[];
      readonly multiHashSignatureBase64: string;
      readonly publicKeyFingerprint?: string | null;
    }): Promise<SubmittedExternalPartyWalletOnboarding> {
      assertCantonSha256MultihashHex(input.multiHashHex);
      const synchronizerId = await readRequiredConnectedSynchronizerId(options.ledgerClient, options.providerPartyId);
      if (synchronizerId !== input.synchronizerId) {
        throw new ValidationError(
          "Prepared Canton synchronizer no longer matches the provider's connected synchronizer",
          {
            expectedSynchronizerId: input.synchronizerId,
            synchronizerId,
          }
        );
      }
      const submitted = await submitExternalPartyOnboarding({
        ledgerClient: options.ledgerClient,
        synchronizerId,
        partyId: input.partyId,
        publicKeyBase64: input.publicKeyBase64,
        multiHashHex: input.multiHashHex,
        topologyTransactions: input.topologyTransactions,
        multiHashSignatureBase64: input.multiHashSignatureBase64,
        ...(input.publicKeyFingerprint !== undefined ? { publicKeyFingerprint: input.publicKeyFingerprint } : {}),
        allowAlreadyExists: true,
      });
      return {
        partyId: submitted.partyId,
        raw: submitted.raw,
        alreadyExisted: submitted.alreadyExisted,
      };
    },

    async prepareCcTransfer(
      input: PrepareExternalPartyWalletCcTransferInput
    ): Promise<PreparedExternalPartyWalletCcTransfer> {
      const validatorClient = requireValidatorClient(options.validatorClient, 'CC transfer prepare');
      const amount = normalizeAmountString(input.amount);
      const description = normalizeDescription(input.description);
      const publicKeyFingerprint = assertCantonPartyMatchesPublicKey({
        partyId: input.senderPartyId,
        publicKeyBase64: input.publicKeyBase64,
      });
      const prepared = await prepareExternalPartyCcTransfer(validatorClient, {
        senderPartyId: input.senderPartyId,
        receiverPartyId: input.receiverPartyId,
        amount,
        verboseHashing: false,
        ...(description ? { description } : {}),
      });

      return {
        senderPartyId: input.senderPartyId,
        receiverPartyId: input.receiverPartyId,
        amount,
        description,
        preparedTransaction: prepared.transaction,
        preparedTransactionHashHex: prepared.transactionHashHex,
        transferCommandContractIdPrefix: prepared.transferCommandContractIdPrefix,
        nonce: prepared.nonce,
        expiresAt: prepared.expiresAt,
        prepareToken: buildCantonPrepareToken(
          options.prepareTokenSecret,
          buildExternalPartyCcTransferPrepareTokenPayload({
            provider: options.provider,
            network: options.network,
            tokenContext: input.tokenContext,
            senderPartyId: input.senderPartyId,
            receiverPartyId: input.receiverPartyId,
            amount,
            description,
            publicKeyFingerprint,
            preparedTransaction: prepared.transaction,
            preparedTransactionHashHex: prepared.transactionHashHex,
            transferCommandContractIdPrefix: prepared.transferCommandContractIdPrefix,
            nonce: prepared.nonce,
            expiresAt: prepared.expiresAt,
          })
        ),
        hashingDetails: readOptionalString(objectOrEmpty(prepared.raw), 'hashing_details'),
      };
    },

    async submitCcTransfer(
      input: SubmitExternalPartyWalletCcTransferInput,
      hooks: SubmitExternalPartyWalletCcTransferHooks = {}
    ): Promise<SubmittedExternalPartyWalletCcTransfer> {
      const validatorClient = requireValidatorClient(options.validatorClient, 'CC transfer submit');
      const amount = normalizeAmountString(input.amount);
      const description = normalizeDescription(input.description);
      const publicKeyFingerprint = assertCantonPartyMatchesPublicKey({
        partyId: input.senderPartyId,
        publicKeyBase64: input.publicKeyBase64,
        ...(input.publicKeyFingerprint !== undefined ? { publicKeyFingerprint: input.publicKeyFingerprint } : {}),
      });
      assertCantonPrepareToken(
        options.prepareTokenSecret,
        input.prepareToken,
        buildExternalPartyCcTransferPrepareTokenPayload({
          provider: options.provider,
          network: options.network,
          tokenContext: input.tokenContext,
          senderPartyId: input.senderPartyId,
          receiverPartyId: input.receiverPartyId,
          amount,
          description,
          publicKeyFingerprint,
          preparedTransaction: input.preparedTransaction,
          preparedTransactionHashHex: input.preparedTransactionHashHex,
          transferCommandContractIdPrefix: input.transferCommandContractIdPrefix,
          nonce: input.nonce,
          expiresAt: input.expiresAt,
        })
      );
      assertCantonHashSignature({
        publicKeyBase64: input.publicKeyBase64,
        hashHex: input.preparedTransactionHashHex,
        signatureBase64: input.signatureBase64,
      });

      await hooks.beforeSubmit?.();
      let submitted: SubmittedExternalPartyCcTransfer;
      try {
        submitted = await submitExternalPartyCcTransfer(validatorClient, {
          senderPartyId: input.senderPartyId,
          transaction: input.preparedTransaction,
          transactionHashSignatureHex: decodeBase64(input.signatureBase64, 'signatureBase64').toString('hex'),
          publicKeyHex: extractRawEd25519PublicKey(input.publicKeyBase64).toString('hex'),
        });
      } catch (error) {
        try {
          await hooks.afterSubmitFailure?.(error);
        } catch (hookError) {
          throw new OperationError(
            'afterSubmitFailure hook failed after Canton CC transfer submit failed',
            OperationErrorCode.TRANSACTION_FAILED,
            {
              senderPartyId: input.senderPartyId,
              submitCause: errorToContext(error),
              hookCause: errorToContext(hookError),
            }
          );
        }
        throw error;
      }

      const raw = objectOrEmpty(submitted.raw);
      const updateId = readOptionalUpdateId(submitted);
      if (!updateId) {
        const missingUpdateIdError = new OperationError(
          'Canton CC transfer submit response did not include updateId',
          OperationErrorCode.TRANSACTION_FAILED,
          {
            senderPartyId: input.senderPartyId,
            raw,
          }
        );
        try {
          await hooks.afterSubmitWithoutUpdateId?.({
            senderPartyId: input.senderPartyId,
            raw,
          });
        } catch (hookError) {
          throw new OperationError(
            'afterSubmitWithoutUpdateId hook failed after Canton CC transfer submit returned without updateId',
            OperationErrorCode.TRANSACTION_FAILED,
            {
              senderPartyId: input.senderPartyId,
              raw,
              submitCause: errorToContext(missingUpdateIdError),
              hookCause: errorToContext(hookError),
            }
          );
        }
        throw missingUpdateIdError;
      }
      const result: SubmittedExternalPartyWalletCcTransfer = {
        senderPartyId: input.senderPartyId,
        updateId,
        raw,
      };
      try {
        await hooks.afterSubmit?.(result);
      } catch (hookError) {
        throw new OperationError(
          'afterSubmit hook failed after Canton CC transfer submit succeeded',
          OperationErrorCode.TRANSACTION_FAILED,
          {
            senderPartyId: input.senderPartyId,
            updateId,
            raw,
            hookCause: errorToContext(hookError),
          }
        );
      }
      return result;
    },

    async prepareProviderTransfer(
      input: PrepareExternalPartyWalletProviderTransferInput
    ): Promise<PreparedExternalPartyWalletProviderTransfer> {
      const validatorClient = requireValidatorClient(options.validatorClient, 'provider transfer prepare');
      const amount = normalizeAmountString(input.amount);
      const description = normalizeDescription(input.description);
      const publicKeyFingerprint = assertCantonPartyMatchesPublicKey({
        partyId: input.receiverPartyId,
        publicKeyBase64: input.publicKeyBase64,
      });
      const sourceBalanceBefore = await validatorClient.getWalletBalance();
      const preparedOffer = input.offerContractId
        ? await readResumableProviderTransferOffer({
            validatorClient,
            receiverPartyId: input.receiverPartyId,
            amount,
            description,
            offerContractId: validateExistingOfferContractId(input.offerContractId),
            offerUpdateId: input.offerUpdateId ?? null,
          })
        : await createProviderTransferOffer({
            validatorClient,
            receiverPartyId: input.receiverPartyId,
            amount,
            description,
            expiresAt: epochMillisecondsToMicroseconds(now() + providerTransferOfferTtlMs),
            trackingId: buildProviderTransferTrackingId({
              receiverPartyId: input.receiverPartyId,
              amount,
              now: now(),
              randomId: randomId(),
            }),
          });
      const sourceBalanceAfter = await readOptionalProviderWalletBalance(validatorClient);
      const commandId = input.commandId ?? `accept-provider-offer-${randomId()}`;
      let preparedAccept: PreparedExternalPartyTransferOfferAcceptance;
      try {
        preparedAccept = await prepareProviderTransferAcceptance({
          ledgerClient: options.ledgerClient,
          validatorClient,
          providerPartyId: options.providerPartyId,
          providerUserId: options.providerUserId,
          offerContractId: preparedOffer.offerContractId,
          receiverPartyId: input.receiverPartyId,
          commandId,
        });
      } catch (error) {
        throw new OperationError(
          'Canton provider-funded transfer acceptance prepare failed; retry with the returned offerContractId to avoid creating a duplicate offer',
          OperationErrorCode.TRANSACTION_FAILED,
          {
            cause: error instanceof Error ? error.message : String(error),
            sourcePartyId: options.providerPartyId,
            receiverPartyId: input.receiverPartyId,
            amount,
            description,
            offerContractId: preparedOffer.offerContractId,
            offerUpdateId: preparedOffer.offerUpdateId,
            trackingId: preparedOffer.trackingId,
            commandId,
          }
        );
      }

      return {
        sourcePartyId: options.providerPartyId,
        receiverPartyId: input.receiverPartyId,
        amount,
        description,
        offerContractId: preparedOffer.offerContractId,
        offerUpdateId: preparedOffer.offerUpdateId,
        commandId,
        synchronizerId: preparedAccept.synchronizerId,
        preparedTransaction: preparedAccept.preparedTransaction,
        preparedTransactionHashHex: preparedAccept.preparedTransactionHashHex,
        hashingSchemeVersion: preparedAccept.hashingSchemeVersion,
        prepareToken: buildCantonPrepareToken(
          options.prepareTokenSecret,
          buildProviderTransferAcceptPrepareTokenPayload({
            provider: options.provider,
            network: options.network,
            tokenContext: input.tokenContext,
            sourcePartyId: options.providerPartyId,
            receiverPartyId: input.receiverPartyId,
            amount,
            description,
            publicKeyFingerprint,
            offerContractId: preparedOffer.offerContractId,
            offerUpdateId: preparedOffer.offerUpdateId,
            commandId,
            synchronizerId: preparedAccept.synchronizerId,
            preparedTransaction: preparedAccept.preparedTransaction,
            preparedTransactionHashHex: preparedAccept.preparedTransactionHashHex,
            hashingSchemeVersion: preparedAccept.hashingSchemeVersion,
          })
        ),
        sourceBalanceBefore,
        sourceBalanceAfter,
        raw: {
          offer: preparedOffer.offer,
          offerStatus: preparedOffer.offerStatus,
          offerDisclosure: preparedAccept.offerDisclosure.raw,
          prepared: preparedAccept.raw,
        },
      };
    },

    async submitProviderTransfer(
      input: SubmitExternalPartyWalletProviderTransferInput
    ): Promise<SubmittedExternalPartyWalletProviderTransfer> {
      const validatorClient = requireValidatorClient(options.validatorClient, 'provider transfer submit');
      const amount = normalizeAmountString(input.amount);
      const description = normalizeDescription(input.description);
      const publicKeyFingerprint = assertCantonPartyMatchesPublicKey({
        partyId: input.receiverPartyId,
        publicKeyBase64: input.publicKeyBase64,
        ...(input.publicKeyFingerprint !== undefined ? { publicKeyFingerprint: input.publicKeyFingerprint } : {}),
      });
      const hashingSchemeVersion = input.hashingSchemeVersion ?? 'HASHING_SCHEME_VERSION_V2';
      assertCantonPrepareToken(
        options.prepareTokenSecret,
        input.prepareToken,
        buildProviderTransferAcceptPrepareTokenPayload({
          provider: options.provider,
          network: options.network,
          tokenContext: input.tokenContext,
          sourcePartyId: options.providerPartyId,
          receiverPartyId: input.receiverPartyId,
          amount,
          description,
          publicKeyFingerprint,
          offerContractId: input.offerContractId,
          offerUpdateId: input.offerUpdateId,
          commandId: input.commandId,
          synchronizerId: input.synchronizerId,
          preparedTransaction: input.preparedTransaction,
          preparedTransactionHashHex: input.preparedTransactionHashHex,
          hashingSchemeVersion,
        })
      );
      assertCantonHashSignature({
        publicKeyBase64: input.publicKeyBase64,
        hashHex: input.preparedTransactionHashHex,
        signatureBase64: input.signatureBase64,
      });

      const submitted = await submitExternalPartyTransferOfferAcceptance({
        ledgerClient: options.ledgerClient,
        userId: options.providerUserId,
        acceptingPartyId: input.receiverPartyId,
        publicKeyBase64: input.publicKeyBase64,
        publicKeyFingerprint,
        preparedTransaction: input.preparedTransaction,
        preparedTransactionHashHex: input.preparedTransactionHashHex,
        signatureBase64: input.signatureBase64,
        hashingSchemeVersion,
        submissionId: randomId(),
      });
      const acceptUpdateId = readRequiredUpdateId(submitted, 'provider CC transfer accept submit');
      const sourceBalanceAfter = await readOptionalProviderWalletBalance(validatorClient);

      return {
        sourcePartyId: options.providerPartyId,
        receiverPartyId: input.receiverPartyId,
        amount,
        description,
        offerContractId: input.offerContractId,
        offerUpdateId: input.offerUpdateId,
        acceptUpdateId,
        updateId: acceptUpdateId,
        sourceBalanceAfter,
        raw: objectOrEmpty(submitted.raw),
      };
    },

    async prepareTransferPreapprovalSetup(
      input: ExternalPartyWalletTransferPreapprovalSetupInput
    ): Promise<PreparedExternalPartyWalletTransferPreapprovalSetup> {
      const validatorClient = requireValidatorClient(options.validatorClient, 'transfer preapproval setup prepare');
      return prepareExternalPartyTransferPreapprovalSetup(validatorClient, input);
    },

    async submitTransferPreapprovalSetup(
      input: ExternalPartyWalletTransferPreapprovalSubmitInput
    ): Promise<SubmittedExternalPartyWalletTransferPreapprovalSetup> {
      const validatorClient = requireValidatorClient(options.validatorClient, 'transfer preapproval setup submit');
      return submitExternalPartyTransferPreapprovalSetup(validatorClient, input);
    },

    async sendProviderTransferToPreapprovedParty(
      input: ExternalPartyWalletProviderTransferToPreapprovedInput
    ): Promise<ExternalPartyWalletProviderTransferToPreapproved> {
      const validatorClient = requireValidatorClient(
        options.validatorClient,
        'provider transfer preapproval wallet send'
      );
      const amount = normalizeAmountString(input.amount);
      const description = normalizeDescription(input.description);
      const transferPreapproval = await lookupExternalPartyTransferPreapproval(validatorClient, input.receiverPartyId);
      if (!transferPreapproval) {
        throw new OperationError(
          'Receiver party does not have transfer preapproval',
          OperationErrorCode.MISSING_CONTRACT,
          { receiverPartyId: input.receiverPartyId }
        );
      }
      const sent = await sendWalletTransferToPreapprovedParty(validatorClient, {
        receiverPartyId: input.receiverPartyId,
        amount,
        deduplicationId: input.idempotencyKey,
        ...(description ? { description } : {}),
      });
      const sourceBalanceAfter = await readOptionalProviderWalletBalance(validatorClient);
      return {
        sourcePartyId: options.providerPartyId,
        receiverPartyId: input.receiverPartyId,
        amount,
        description,
        transferPreapprovalContractId: transferPreapproval.contractId,
        updateId: sent.updateId,
        sourceBalanceAfter,
        raw: {
          transferPreapproval: transferPreapproval.raw,
          transferPreapprovalSend: sent.raw,
        },
      };
    },

    async listActiveContracts(
      input: ListExternalPartyWalletActiveContractsInput
    ): Promise<ExternalPartyWalletActiveContracts> {
      const contracts = await options.ledgerClient.getActiveContracts({
        parties: [input.partyId],
        ...(input.templateIds && input.templateIds.length > 0 ? { templateIds: [...input.templateIds] } : {}),
        includeCreatedEventBlob: input.includeCreatedEventBlob ?? true,
      });
      if (!Array.isArray(contracts)) {
        throw new OperationError(
          'Canton active contracts response did not include an array',
          OperationErrorCode.TRANSACTION_FAILED
        );
      }
      return {
        contracts: contracts.slice(0, input.limit ?? 50),
      };
    },

    async getExternalPartyBalance(input: { readonly partyId: string }): Promise<ExternalPartyWalletBalance> {
      const validatorClient = requireValidatorClient(options.validatorClient, 'external party balance');
      let raw: unknown;
      try {
        raw = await validatorClient.getExternalPartyBalance({ partyId: input.partyId });
      } catch (error) {
        if (!isNotFound(error)) throw error;
        raw = await readExternalPartyBalanceFromActiveAmulets(options.ledgerClient, input.partyId);
      }
      return {
        partyId: input.partyId,
        fetchedAt: new Date(now()).toISOString(),
        raw,
      };
    },
  };
}

export function buildExternalPartyCcTransferPrepareTokenPayload(input: {
  readonly provider?: string | undefined;
  readonly network?: string | undefined;
  readonly tokenContext?: ExternalPartyWalletTokenContext | undefined;
  readonly senderPartyId: string;
  readonly receiverPartyId: string;
  readonly amount: string;
  readonly description: string | null;
  readonly publicKeyFingerprint: string;
  readonly preparedTransaction: string;
  readonly preparedTransactionHashHex: string;
  readonly transferCommandContractIdPrefix: string;
  readonly nonce: number;
  readonly expiresAt: string;
}): Record<string, unknown> {
  return {
    kind: 'external-party-cc-transfer',
    version: 1,
    provider: input.provider ?? null,
    network: input.network ?? null,
    context: normalizeTokenContext(input.tokenContext),
    senderPartyId: input.senderPartyId,
    receiverPartyId: input.receiverPartyId,
    amount: input.amount,
    description: input.description,
    publicKeyFingerprint: input.publicKeyFingerprint,
    preparedTransactionSha256: hashPreparedTransaction(input.preparedTransaction),
    preparedTransactionHashHex: input.preparedTransactionHashHex,
    transferCommandContractIdPrefix: input.transferCommandContractIdPrefix,
    nonce: input.nonce,
    expiresAt: input.expiresAt,
  };
}

export function buildProviderTransferAcceptPrepareTokenPayload(input: {
  readonly provider?: string | undefined;
  readonly network?: string | undefined;
  readonly tokenContext?: ExternalPartyWalletTokenContext | undefined;
  readonly sourcePartyId: string;
  readonly receiverPartyId: string;
  readonly amount: string;
  readonly description: string | null;
  readonly publicKeyFingerprint: string;
  readonly offerContractId: string;
  readonly offerUpdateId: string | null;
  readonly commandId: string;
  readonly synchronizerId: string;
  readonly preparedTransaction: string;
  readonly preparedTransactionHashHex: string;
  readonly hashingSchemeVersion: string;
}): Record<string, unknown> {
  return {
    kind: 'provider-transfer-accept',
    version: 1,
    provider: input.provider ?? null,
    network: input.network ?? null,
    context: normalizeTokenContext(input.tokenContext),
    sourcePartyId: input.sourcePartyId,
    receiverPartyId: input.receiverPartyId,
    amount: input.amount,
    description: input.description,
    publicKeyFingerprint: input.publicKeyFingerprint,
    offerContractId: input.offerContractId,
    offerUpdateId: input.offerUpdateId,
    commandId: input.commandId,
    synchronizerId: input.synchronizerId,
    preparedTransactionSha256: hashPreparedTransaction(input.preparedTransaction),
    preparedTransactionHashHex: input.preparedTransactionHashHex,
    hashingSchemeVersion: input.hashingSchemeVersion,
  };
}

export function normalizeExternalPartyWalletDescription(description: string | null | undefined): string | null {
  const normalized = description?.trim();
  if (!normalized) return null;
  return normalized;
}

export function parseExternalPartyWalletConnectedSynchronizerId(raw: unknown): string | null {
  if (!isRecord(raw) && !Array.isArray(raw)) return null;
  const direct = isRecord(raw) ? raw['connectedSynchronizers'] : undefined;
  const itemsField = isRecord(raw) ? raw['items'] : undefined;
  const items: unknown[] = Array.isArray(raw)
    ? raw
    : Array.isArray(direct)
      ? direct
      : Array.isArray(itemsField)
        ? itemsField
        : [];
  const synchronizerIds: string[] = [];
  for (const item of items) {
    if (typeof item === 'string' && item.trim()) {
      synchronizerIds.push(item.trim());
      continue;
    }
    if (!isRecord(item)) continue;
    for (const key of ['synchronizerId', 'synchronizer', 'domainId', 'id']) {
      const value = item[key];
      if (typeof value === 'string' && value.trim()) {
        synchronizerIds.push(value.trim());
        break;
      }
    }
  }
  const uniqueSynchronizerIds = new Set(synchronizerIds);
  if (uniqueSynchronizerIds.size > 1) {
    throw new OperationError(
      'Canton provider reported multiple connected synchronizers',
      OperationErrorCode.MISSING_DOMAIN_ID,
      { synchronizerIds }
    );
  }
  return synchronizerIds[0] ?? null;
}

async function prepareProviderTransferAcceptance(input: {
  readonly ledgerClient: LedgerJsonApiClient;
  readonly validatorClient: ValidatorApiClient;
  readonly providerPartyId: string;
  readonly providerUserId: string;
  readonly offerContractId: string;
  readonly receiverPartyId: string;
  readonly commandId: string;
  readonly synchronizerId?: string;
}): Promise<PreparedExternalPartyTransferOfferAcceptance> {
  return prepareExternalPartyTransferOfferAcceptance({
    ledgerClient: input.ledgerClient,
    validatorClient: input.validatorClient,
    providerPartyId: input.providerPartyId,
    commandId: input.commandId,
    userId: input.providerUserId,
    acceptingPartyId: input.receiverPartyId,
    offerContractId: input.offerContractId,
    ...(input.synchronizerId ? { synchronizerId: input.synchronizerId } : {}),
  });
}

async function createProviderTransferOffer(input: {
  readonly validatorClient: ValidatorApiClient;
  readonly receiverPartyId: string;
  readonly amount: string;
  readonly description: string | null;
  readonly expiresAt: number;
  readonly trackingId: string;
}): Promise<ProviderTransferOfferForAcceptance> {
  const offer = await input.validatorClient.createTransferOffer({
    receiver_party_id: input.receiverPartyId,
    amount: input.amount,
    description: input.description ?? '',
    expires_at: input.expiresAt,
    tracking_id: input.trackingId,
  });
  const offerContractId = readRequiredString(offer, 'offer_contract_id', 'provider CC transfer offer');
  const offerStatus = await readOptionalTransferOfferStatus(input.validatorClient, input.trackingId);
  return {
    offer,
    offerContractId,
    offerStatus,
    offerUpdateId: readOptionalUpdateId(offerStatus),
    trackingId: input.trackingId,
  };
}

async function readResumableProviderTransferOffer(input: {
  readonly validatorClient: ValidatorApiClient;
  readonly receiverPartyId: string;
  readonly amount: string;
  readonly description: string | null;
  readonly offerContractId: string;
  readonly offerUpdateId: string | null;
}): Promise<ProviderTransferOfferForAcceptance> {
  const offerList = await input.validatorClient.listTransferOffers();
  const offer = readTransferOfferByContractId(offerList, input.offerContractId);
  if (!offer) {
    throw new OperationError(
      'Canton transfer offer was not found for provider transfer resume',
      OperationErrorCode.MISSING_CONTRACT,
      { offerContractId: input.offerContractId }
    );
  }

  assertResumedProviderTransferOfferMatches({
    offer,
    offerContractId: input.offerContractId,
    receiverPartyId: input.receiverPartyId,
    amount: input.amount,
    description: input.description,
  });

  return {
    offer,
    offerContractId: input.offerContractId,
    offerStatus: null,
    offerUpdateId: input.offerUpdateId,
    trackingId: readTransferOfferString(offer, ['trackingId', 'tracking_id'], false),
  };
}

function validateExistingOfferContractId(offerContractId: string): string {
  const normalized = offerContractId.trim();
  if (!normalized) {
    throw new ValidationError('offerContractId is required when resuming provider transfer prepare');
  }
  return normalized;
}

async function readConnectedSynchronizers(
  ledgerClient: LedgerJsonApiClient,
  providerPartyId: string
): Promise<ExternalPartyWalletConnectedSynchronizers> {
  const raw = await ledgerClient.getConnectedSynchronizers({ party: providerPartyId });
  return {
    synchronizerId: parseExternalPartyWalletConnectedSynchronizerId(raw),
    raw,
  };
}

async function readRequiredConnectedSynchronizerId(
  ledgerClient: LedgerJsonApiClient,
  providerPartyId: string
): Promise<string> {
  const { synchronizerId } = await readConnectedSynchronizers(ledgerClient, providerPartyId);
  if (synchronizerId) return synchronizerId;
  throw new OperationError(
    'Canton provider did not report a connected synchronizer',
    OperationErrorCode.MISSING_DOMAIN_ID
  );
}

async function readExternalPartyBalanceFromActiveAmulets(
  ledgerClient: LedgerJsonApiClient,
  partyId: string
): Promise<Record<string, unknown>> {
  const contracts = await ledgerClient.getActiveContracts({
    parties: [partyId],
    includeCreatedEventBlob: false,
  });
  const amulets = readAmuletBalanceContracts(contracts, partyId);
  return {
    source: 'ledger-active-contracts',
    reason: 'validator-external-party-wallet-not-found',
    effective_unlocked_qty: sumDecimalStrings(amulets.map((amulet) => amulet.amount)),
    effective_locked_qty: '0',
    contracts: amulets,
  };
}

function readAmuletBalanceContracts(
  source: unknown,
  ownerPartyId: string
): Array<{
  readonly contractId: string | null;
  readonly templateId: string;
  readonly amount: string;
}> {
  if (!Array.isArray(source)) return [];
  const amulets: Array<{
    readonly contractId: string | null;
    readonly templateId: string;
    readonly amount: string;
  }> = [];

  for (const item of source) {
    const contractEntry = isRecord(item) ? objectOrEmpty(item['contractEntry']) : {};
    const activeContract = objectOrEmpty(contractEntry['JsActiveContract']);
    const createdEvent = objectOrEmpty(activeContract['createdEvent']);
    const templateId = readFirstString(createdEvent, ['templateId', 'template_id']);
    if (!templateId?.includes(':Splice.Amulet:Amulet')) continue;
    const createArgument = objectOrEmpty(createdEvent['createArgument']);
    if (createArgument['owner'] !== ownerPartyId) continue;
    const amount = objectOrEmpty(createArgument['amount']);
    const initialAmount = readFirstString(amount, ['initialAmount', 'initial_amount']);
    if (!initialAmount) continue;
    amulets.push({
      contractId: readFirstString(createdEvent, ['contractId', 'contract_id']),
      templateId,
      amount: initialAmount,
    });
  }

  return amulets;
}

function buildProviderTransferTrackingId(input: {
  readonly receiverPartyId: string;
  readonly amount: string;
  readonly now: number;
  readonly randomId: string;
}): string {
  return `provider-funding-${createHash('sha256')
    .update(`${input.receiverPartyId}:${input.amount}:${input.now}:${input.randomId}`)
    .digest('hex')
    .slice(0, 32)}`;
}

function epochMillisecondsToMicroseconds(epochMilliseconds: number): number {
  return epochMilliseconds * 1000;
}

function validateProviderTransferOfferTtlMs(providerTransferOfferTtlMs: number): number {
  if (!Number.isSafeInteger(providerTransferOfferTtlMs) || providerTransferOfferTtlMs <= 0) {
    throw new ValidationError('providerTransferOfferTtlMs must be a positive safe integer', {
      providerTransferOfferTtlMs,
    });
  }
  return providerTransferOfferTtlMs;
}

function requireValidatorClient(
  validatorClient: ValidatorApiClient | null | undefined,
  operation: string
): ValidatorApiClient {
  if (!validatorClient) {
    throw new ConfigurationError(`validatorClient is required for ${operation}`);
  }
  return validatorClient;
}

async function readOptionalTransferOfferStatus(
  validatorClient: ValidatorApiClient,
  trackingId: string
): Promise<unknown | null> {
  try {
    return await validatorClient.getTransferOfferStatus({ trackingId });
  } catch (error) {
    if (!isNotFound(error)) throw error;
    return null;
  }
}

async function readOptionalProviderWalletBalance(validatorClient: ValidatorApiClient): Promise<unknown | null> {
  try {
    return await validatorClient.getWalletBalance();
  } catch (error) {
    if (!isNotFound(error)) throw error;
    return null;
  }
}

function readRequiredUpdateId(source: SubmittedExternalPartyTransferOfferAcceptance, operation: string): string {
  const updateId = readOptionalUpdateId(source);
  if (updateId) return updateId;
  throw new OperationError(
    `Canton ${operation} response did not include updateId`,
    OperationErrorCode.TRANSACTION_FAILED
  );
}

function readOptionalUpdateId(source: unknown): string | null {
  if (!isRecord(source)) return null;
  for (const key of ['updateId', 'update_id', 'transaction_id', 'transactionId']) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return readOptionalUpdateId(source['raw']);
}

function readOptionalString(source: Record<string, unknown>, key: string): string | null {
  const value = source[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

function readFirstString(record: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return null;
}

const CANTON_DECIMAL_AMOUNT_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;

function normalizeAmountString(amount: string | number): string {
  const normalized = typeof amount === 'number' ? amount.toString() : amount.trim();
  if (typeof amount === 'number') {
    if (!Number.isFinite(amount)) {
      throw new ValidationError('amount must be a finite decimal amount', { amount });
    }
  }
  if (!normalized) {
    throw new ValidationError('amount is required', { amount });
  }
  if (!CANTON_DECIMAL_AMOUNT_PATTERN.test(normalized) || decimalAmountIsZero(normalized)) {
    throw new ValidationError('amount must be a positive decimal amount', { amount });
  }
  return normalized;
}

function decimalAmountIsZero(amount: string): boolean {
  return /^0(?:\.0+)?$/.test(amount);
}

function readTransferOfferByContractId(source: unknown, offerContractId: string): Record<string, unknown> | null {
  const sourceOffers = isRecord(source) ? source['offers'] : undefined;
  const offers = Array.isArray(sourceOffers) ? sourceOffers : source;
  if (!Array.isArray(offers)) return null;

  for (const offer of offers) {
    if (!isRecord(offer)) continue;
    const contractId = readTransferOfferString(offer, ['contractId', 'contract_id'], false);
    if (contractId === offerContractId) return offer;
  }
  return null;
}

function assertResumedProviderTransferOfferMatches(input: {
  readonly offer: Record<string, unknown>;
  readonly offerContractId: string;
  readonly receiverPartyId: string;
  readonly amount: string;
  readonly description: string | null;
}): void {
  const receiverPartyId = readTransferOfferString(
    input.offer,
    ['receiverPartyId', 'receiver_party_id', 'receiver', 'receiverParty'],
    false
  );
  const amount = readTransferOfferString(input.offer, ['amount'], false);
  const description = readTransferOfferString(input.offer, ['description'], true);
  if (receiverPartyId === null || amount === null || description === null) {
    const missingFields: string[] = [];
    if (receiverPartyId === null) missingFields.push('receiverPartyId');
    if (amount === null) missingFields.push('amount');
    if (description === null) missingFields.push('description');
    throw new OperationError(
      'Canton transfer-offer details were unavailable for provider transfer resume',
      OperationErrorCode.MISSING_CONTRACT,
      {
        offerContractId: input.offerContractId,
        missingFields,
      }
    );
  }

  const expectedDescription = input.description ?? '';
  const amountMatches =
    normalizeDecimalForComparison(amount) !== null &&
    normalizeDecimalForComparison(amount) === normalizeDecimalForComparison(input.amount);
  if (receiverPartyId !== input.receiverPartyId || !amountMatches || description !== expectedDescription) {
    throw new ValidationError('Resumed provider transfer offer does not match the requested transfer details', {
      offerContractId: input.offerContractId,
      expected: {
        receiverPartyId: input.receiverPartyId,
        amount: input.amount,
        description: expectedDescription,
      },
      actual: {
        receiverPartyId,
        amount,
        description,
      },
    });
  }
}

function readTransferOfferString(
  source: Record<string, unknown>,
  keys: readonly string[],
  allowEmpty: boolean
): string | null {
  for (const record of readTransferOfferCandidateRecords(source)) {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === 'string') {
        const normalized = value.trim();
        if (normalized || allowEmpty) return normalized;
      }
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value.toString();
      }
    }
  }
  return null;
}

function readTransferOfferCandidateRecords(source: Record<string, unknown>): ReadonlyArray<Record<string, unknown>> {
  const transferOffer = objectOrEmpty(source['transfer_offer']);
  const transferOfferContract = objectOrEmpty(transferOffer['contract']);
  const transferOfferPayload = objectOrEmpty(transferOffer['payload']);
  const offer = objectOrEmpty(source['offer']);
  const offerContract = objectOrEmpty(offer['contract']);
  const offerPayload = objectOrEmpty(offer['payload']);
  const contract = objectOrEmpty(source['contract']);
  const contractPayload = objectOrEmpty(contract['payload']);
  const payload = objectOrEmpty(source['payload']);
  const createArgument = objectOrEmpty(source['createArgument'] ?? source['create_argument']);
  return [
    source,
    payload,
    createArgument,
    contract,
    contractPayload,
    offer,
    offerPayload,
    offerContract,
    transferOffer,
    transferOfferPayload,
    transferOfferContract,
  ];
}

function normalizeDecimalForComparison(amount: string): string | null {
  const normalized = amount.trim();
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;
  const [whole = '0', fraction = ''] = normalized.split('.');
  const normalizedWhole = whole.replace(/^0+(?=\d)/, '') || '0';
  const normalizedFraction = fraction.replace(/0+$/, '');
  return normalizedFraction ? `${normalizedWhole}.${normalizedFraction}` : normalizedWhole;
}

function normalizeDescription(description: string | null | undefined): string | null {
  return normalizeExternalPartyWalletDescription(description);
}

function normalizeTokenContext(context: ExternalPartyWalletTokenContext | undefined): Record<string, unknown> {
  if (!context) return {};
  return Object.fromEntries(Object.entries(context).filter(([, value]) => value !== undefined));
}

function decodeBase64(value: string, label: string): Buffer {
  const normalized = value.trim().replace(/-/g, '+').replace(/_/g, '/');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(normalized) || normalized.length % 4 === 1) {
    throw new ValidationError(`${label} must be base64-encoded`);
  }
  return Buffer.from(normalized, 'base64');
}

function errorToContext(error: unknown): Record<string, unknown> {
  const record = isRecord(error) ? error : {};
  const message =
    typeof record['message'] === 'string' && record['message'].trim()
      ? record['message']
      : error instanceof Error
        ? error.message
        : String(error);
  return {
    ...(typeof record['name'] === 'string' ? { name: record['name'] } : {}),
    message,
    ...(record['code'] !== undefined ? { code: record['code'] } : {}),
    ...(record['status'] !== undefined ? { status: record['status'] } : {}),
    ...(record['context'] !== undefined ? { context: record['context'] } : {}),
  };
}

function isNotFound(error: unknown): boolean {
  if (error instanceof ApiError) {
    return error.status === 404;
  }
  return isRecord(error) && error['status'] === 404;
}

function sumDecimalStrings(values: readonly string[]): string {
  let scale = 0;
  const parsed = values.map((value) => {
    const [whole = '0', fraction = ''] = value.split('.');
    scale = Math.max(scale, fraction.length);
    return { whole, fraction };
  });
  let total = 0n;
  for (const value of parsed) {
    const whole = BigInt(value.whole === '' ? '0' : value.whole);
    const paddedFraction = value.fraction.padEnd(scale, '0');
    const fraction = BigInt(paddedFraction === '' ? '0' : paddedFraction);
    total += whole * 10n ** BigInt(scale) + fraction;
  }
  if (scale === 0) return total.toString();
  const divisor = 10n ** BigInt(scale);
  const whole = total / divisor;
  const fraction = (total % divisor).toString().padStart(scale, '0');
  return `${whole.toString()}.${fraction}`;
}

function validateRequiredString(name: string, value: string): void {
  if (!value.trim()) {
    throw new ValidationError(`${name} is required`, { [name]: value });
  }
}
