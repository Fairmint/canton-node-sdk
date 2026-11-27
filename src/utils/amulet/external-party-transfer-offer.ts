import { randomUUID } from 'node:crypto';
import { type LedgerJsonApiClient } from '../../clients/ledger-json-api';
import { type ValidatorApiClient } from '../../clients/validator-api';
import { OperationError, OperationErrorCode, ValidationError } from '../../core/errors';
import { isRecord } from '../../core/utils';
import { objectOrEmpty, readRequiredString } from '../canton-response-utils';
import { executeExternalPartySignedTransaction } from '../external-signing/execute-external-party-signed-transaction';
import {
  type ExecuteExternalTransactionAndWaitResult,
  type InteractiveSubmissionHashingSchemeVersion,
} from '../external-signing/execute-external-transaction';
import { prepareExternalTransaction } from '../external-signing/prepare-external-transaction';
import { verifyParticipantPreparedTransaction } from '../external-signing/prepared-transaction';
import { assertSingleConnectedSynchronizerId } from '../party-readiness';

export const CANTON_TRANSFER_OFFER_TEMPLATE_ID = '#splice-wallet:Splice.Wallet.TransferOffer:TransferOffer';

/** The hashing scheme a transfer-offer acceptance is prepared and verified under (the Ledger default). */
const TRANSFER_OFFER_ACCEPTANCE_HASHING_SCHEME = 'HASHING_SCHEME_VERSION_V2';

export interface CantonDisclosedContract {
  readonly contractId: string;
  readonly templateId: string;
  readonly createdEventBlob: string;
  readonly synchronizerId: string;
}

export interface TransferOfferDisclosure {
  readonly contract: CantonDisclosedContract;
  readonly raw: Record<string, unknown>;
}

export interface PrepareExternalPartyTransferOfferAcceptanceOptions {
  readonly ledgerClient: LedgerJsonApiClient;
  readonly validatorClient?: ValidatorApiClient;
  /** Provider/source party that created the offer. Used for synchronizer and active-contract disclosure lookup. */
  readonly providerPartyId: string;
  readonly userId: string;
  readonly acceptingPartyId: string;
  readonly offerContractId: string;
  readonly commandId?: string;
  readonly synchronizerId?: string;
  readonly disclosedContract?: CantonDisclosedContract;
  readonly verboseHashing?: boolean;
}

export interface PreparedExternalPartyTransferOfferAcceptance {
  readonly offerContractId: string;
  readonly acceptingPartyId: string;
  readonly commandId: string;
  readonly synchronizerId: string;
  readonly preparedTransaction: string;
  readonly preparedTransactionHashHex: string;
  readonly hashingSchemeVersion: InteractiveSubmissionHashingSchemeVersion;
  readonly offerDisclosure: TransferOfferDisclosure;
  readonly raw: Record<string, unknown>;
}

export interface SubmitExternalPartyTransferOfferAcceptanceOptions {
  readonly ledgerClient: LedgerJsonApiClient;
  readonly userId: string;
  readonly acceptingPartyId: string;
  readonly publicKeyBase64: string;
  readonly publicKeyFingerprint?: string | null;
  readonly preparedTransaction: string;
  readonly preparedTransactionHashHex: string;
  readonly signatureBase64: string;
  readonly hashingSchemeVersion?: InteractiveSubmissionHashingSchemeVersion;
  readonly submissionId?: string;
}

export interface SubmittedExternalPartyTransferOfferAcceptance extends ExecuteExternalTransactionAndWaitResult {
  readonly acceptingPartyId: string;
}

/**
 * Prepares `TransferOffer_Accept` for an externally hosted party.
 *
 * The returned `preparedTransactionHashHex` is the value the end-user key must sign outside the SDK: the hash
 * recomputed from the prepared transaction, which must act only as the accepting party, under the command id and on the
 * synchronizer requested (a participant answer that does not is refused before anything is returned). The helper
 * fetches the transfer-offer disclosed contract from the validator wallet API when available and falls back to Ledger
 * active contracts for the provider/source party.
 */
export async function prepareExternalPartyTransferOfferAcceptance(
  options: PrepareExternalPartyTransferOfferAcceptanceOptions
): Promise<PreparedExternalPartyTransferOfferAcceptance> {
  validateRequiredString('providerPartyId', options.providerPartyId);
  validateRequiredString('userId', options.userId);
  validateRequiredString('acceptingPartyId', options.acceptingPartyId);
  validateRequiredString('offerContractId', options.offerContractId);

  const connectedSynchronizerId = await readRequiredConnectedSynchronizerId(
    options.ledgerClient,
    options.providerPartyId
  );
  if (options.synchronizerId && options.synchronizerId !== connectedSynchronizerId) {
    throw new ValidationError('Prepared transfer-offer synchronizer no longer matches the provider synchronizer', {
      expectedSynchronizerId: options.synchronizerId,
      connectedSynchronizerId,
    });
  }

  const synchronizerId = connectedSynchronizerId;
  const offerDisclosure = options.disclosedContract
    ? readCallerTransferOfferDisclosure(options.disclosedContract, options.offerContractId, synchronizerId)
    : await readRequiredTransferOfferDisclosedContract({
        ledgerClient: options.ledgerClient,
        providerPartyId: options.providerPartyId,
        offerContractId: options.offerContractId,
        synchronizerId,
        ...(options.validatorClient ? { validatorClient: options.validatorClient } : {}),
      });
  const prepared = await prepareExternalTransaction({
    ledgerClient: options.ledgerClient,
    commands: [
      {
        ExerciseCommand: {
          templateId: CANTON_TRANSFER_OFFER_TEMPLATE_ID,
          contractId: options.offerContractId,
          choice: 'TransferOffer_Accept',
          choiceArgument: {},
        },
      },
    ],
    commandId: options.commandId ?? `accept-transfer-offer-${randomUUID()}`,
    userId: options.userId,
    actAs: [options.acceptingPartyId],
    readAs: [options.acceptingPartyId],
    disclosedContracts: [offerDisclosure.contract],
    synchronizerId,
    hashingSchemeVersion: TRANSFER_OFFER_ACCEPTANCE_HASHING_SCHEME,
    verboseHashing: options.verboseHashing ?? false,
    packageIdSelectionPreference: [],
  });
  // The accepting party signs the hash recomputed from the prepared transaction, never the participant's word for it.
  const verified = await verifyParticipantPreparedTransaction({
    operation: 'transfer-offer accept prepare',
    preparedTransaction: readRequiredString(prepared, 'preparedTransaction', 'transfer-offer accept prepare'),
    preparedTransactionHash: prepared.preparedTransactionHash,
    hashingScheme: TRANSFER_OFFER_ACCEPTANCE_HASHING_SCHEME,
    answeredHashingScheme: prepared.hashingSchemeVersion,
    expected: { actAs: [options.acceptingPartyId], commandId: prepared.commandId, synchronizerId },
  });

  return {
    offerContractId: options.offerContractId,
    acceptingPartyId: options.acceptingPartyId,
    commandId: prepared.commandId,
    synchronizerId,
    preparedTransaction: verified.preparedTransaction,
    preparedTransactionHashHex: verified.preparedTransactionHashHex,
    hashingSchemeVersion: verified.hashingSchemeVersion,
    offerDisclosure,
    raw: objectOrEmpty(prepared),
  };
}

function readCallerTransferOfferDisclosure(
  contract: CantonDisclosedContract,
  offerContractId: string,
  synchronizerId: string
): TransferOfferDisclosure {
  if (contract.contractId !== offerContractId) {
    throw new ValidationError('Disclosed transfer-offer contract ID does not match offerContractId', {
      contractId: contract.contractId,
      offerContractId,
    });
  }
  if (contract.synchronizerId !== synchronizerId) {
    throw new ValidationError('Disclosed transfer-offer synchronizer does not match the provider synchronizer', {
      disclosedSynchronizerId: contract.synchronizerId,
      synchronizerId,
    });
  }
  validateRequiredString('disclosedContract.templateId', contract.templateId);
  validateRequiredString('disclosedContract.createdEventBlob', contract.createdEventBlob);

  return {
    contract,
    raw: { source: 'caller' },
  };
}

/** Verifies the end-user signature and executes a prepared `TransferOffer_Accept`, waiting for the update id. */
export async function submitExternalPartyTransferOfferAcceptance(
  options: SubmitExternalPartyTransferOfferAcceptanceOptions
): Promise<SubmittedExternalPartyTransferOfferAcceptance> {
  validateRequiredString('userId', options.userId);
  const result = await executeExternalPartySignedTransaction({
    ledgerClient: options.ledgerClient,
    userId: options.userId,
    partyId: options.acceptingPartyId,
    publicKeyBase64: options.publicKeyBase64,
    ...(options.publicKeyFingerprint !== undefined ? { publicKeyFingerprint: options.publicKeyFingerprint } : {}),
    preparedTransaction: options.preparedTransaction,
    preparedTransactionHashHex: options.preparedTransactionHashHex,
    signatureBase64: options.signatureBase64,
    ...(options.hashingSchemeVersion !== undefined ? { hashingSchemeVersion: options.hashingSchemeVersion } : {}),
    ...(options.submissionId !== undefined ? { submissionId: options.submissionId } : {}),
  });

  return {
    ...result,
    acceptingPartyId: options.acceptingPartyId,
  };
}

export async function readRequiredTransferOfferDisclosedContract(input: {
  readonly ledgerClient: LedgerJsonApiClient;
  readonly validatorClient?: ValidatorApiClient;
  readonly providerPartyId: string;
  readonly offerContractId: string;
  readonly synchronizerId: string;
}): Promise<TransferOfferDisclosure> {
  if (input.validatorClient) {
    try {
      const offerList = await input.validatorClient.listTransferOffers();
      const disclosed = readTransferOfferDisclosedContractFromList(
        offerList,
        input.offerContractId,
        input.synchronizerId
      );
      if (disclosed) return disclosed;
    } catch {
      // Fall through to Ledger active contracts; some validator deployments do not expose created_event_blob here.
    }
  }

  const activeContracts = await input.ledgerClient.getActiveContracts({
    parties: [input.providerPartyId],
    templateIds: [CANTON_TRANSFER_OFFER_TEMPLATE_ID],
    includeCreatedEventBlob: true,
  });

  const disclosed = readTransferOfferDisclosedContractFromActiveContracts(
    activeContracts,
    input.offerContractId,
    input.synchronizerId
  );
  if (disclosed) return disclosed;

  throw new OperationError(
    'Canton transfer-offer disclosure was unavailable. Retry after the offer is visible on the ledger.',
    OperationErrorCode.MISSING_CONTRACT,
    { offerContractId: input.offerContractId }
  );
}

export function readTransferOfferDisclosedContractFromList(
  source: unknown,
  offerContractId: string,
  synchronizerId: string
): TransferOfferDisclosure | null {
  const sourceOffers = isRecord(source) ? source['offers'] : undefined;
  const offers = Array.isArray(sourceOffers) ? sourceOffers : source;
  if (!Array.isArray(offers)) return null;

  for (const offer of offers) {
    const disclosed = readDisclosedContractFromPossibleOffer(offer, offerContractId, synchronizerId);
    if (disclosed) return disclosed;
  }
  return null;
}

export function readTransferOfferDisclosedContractFromActiveContracts(
  source: unknown,
  offerContractId: string,
  expectedSynchronizerId?: string
): TransferOfferDisclosure | null {
  if (!Array.isArray(source)) return null;

  for (const item of source) {
    const contractEntry = isRecord(item) ? objectOrEmpty(item['contractEntry']) : {};
    const activeContract = objectOrEmpty(contractEntry['JsActiveContract']);
    const createdEvent = objectOrEmpty(activeContract['createdEvent']);
    const contractId = readFirstString([createdEvent], ['contractId', 'contract_id']);
    if (contractId !== offerContractId) continue;
    const templateId =
      readFirstString([createdEvent], ['templateId', 'template_id']) ?? CANTON_TRANSFER_OFFER_TEMPLATE_ID;
    const createdEventBlob = readFirstString([createdEvent], ['createdEventBlob', 'created_event_blob']);
    const synchronizerId = readFirstString(activeContract, [
      'synchronizerId',
      'synchronizer_id',
      'domainId',
      'domain_id',
    ]);
    if (!createdEventBlob || !synchronizerId) continue;
    if (expectedSynchronizerId && synchronizerId !== expectedSynchronizerId) continue;
    return {
      contract: {
        contractId,
        templateId,
        createdEventBlob,
        synchronizerId,
      },
      raw: {
        source: 'ledger-active-contracts',
        contract: isRecord(item) ? item : {},
      },
    };
  }

  return null;
}

function readDisclosedContractFromPossibleOffer(
  source: unknown,
  offerContractId: string,
  defaultSynchronizerId: string
): TransferOfferDisclosure | null {
  if (!isRecord(source)) return null;
  const transferOffer = objectOrEmpty(source['transfer_offer']);
  const transferOfferContract = objectOrEmpty(transferOffer['contract']);
  const offer = objectOrEmpty(source['offer']);
  const offerContract = objectOrEmpty(offer['contract']);
  const contract = objectOrEmpty(source['contract']);
  const records = [source, contract, offer, offerContract, transferOffer, transferOfferContract];

  for (const record of records) {
    const contractId = readFirstString(record, ['contractId', 'contract_id']);
    if (contractId !== offerContractId) continue;
    const createdEventBlob = readFirstString(record, ['createdEventBlob', 'created_event_blob']);
    if (!createdEventBlob) continue;
    const templateId = readFirstString(record, ['templateId', 'template_id']) ?? CANTON_TRANSFER_OFFER_TEMPLATE_ID;
    const synchronizerId =
      readFirstString(record, ['synchronizerId', 'synchronizer_id', 'domainId', 'domain_id']) ?? defaultSynchronizerId;
    if (synchronizerId !== defaultSynchronizerId) continue;

    return {
      contract: {
        contractId,
        templateId,
        createdEventBlob,
        synchronizerId,
      },
      raw: {
        source: 'validator-transfer-offers',
        contract: source,
      },
    };
  }

  return null;
}

async function readRequiredConnectedSynchronizerId(
  ledgerClient: LedgerJsonApiClient,
  providerPartyId: string
): Promise<string> {
  const raw = await ledgerClient.getConnectedSynchronizers({ party: providerPartyId });
  try {
    return assertSingleConnectedSynchronizerId(raw);
  } catch (error) {
    if (error instanceof OperationError && error.message === 'Canton party did not report a connected synchronizer') {
      throw new OperationError(
        'Canton provider did not report a connected synchronizer',
        OperationErrorCode.MISSING_DOMAIN_ID
      );
    }
    if (error instanceof OperationError && error.message === 'Canton party reported multiple connected synchronizers') {
      throw new OperationError(
        'Canton provider reported multiple connected synchronizers',
        OperationErrorCode.MISSING_DOMAIN_ID,
        error.context
      );
    }
    throw error;
  }
}

function validateRequiredString(name: string, value: string): void {
  if (!value.trim()) {
    throw new ValidationError(`${name} is required`, { [name]: value });
  }
}

function readFirstString(
  records: Record<string, unknown> | ReadonlyArray<Record<string, unknown>>,
  keys: readonly string[]
): string | null {
  const sources = Array.isArray(records) ? records : [records];
  for (const record of sources) {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === 'string' && value.trim()) return value;
    }
  }
  return null;
}
