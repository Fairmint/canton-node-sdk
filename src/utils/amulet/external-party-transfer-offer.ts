import { randomUUID } from 'node:crypto';
import { type LedgerJsonApiClient } from '../../clients/ledger-json-api';
import { type ValidatorApiClient } from '../../clients/validator-api';
import { OperationError, OperationErrorCode, ValidationError } from '../../core/errors';
import {
  assertCantonHashSignature,
  assertCantonPartyMatchesPublicKey,
  preparedTransactionHashToHex,
} from '../external-signing/canton-protocol';
import {
  executeExternalTransactionAndWait,
  type ExecuteExternalTransactionAndWaitResult,
} from '../external-signing/execute-external-transaction';
import {
  CANTON_ED25519_SIGNATURE_ALGORITHM,
  CANTON_RAW_SIGNATURE_FORMAT,
} from '../external-signing/external-party-onboarding';
import { prepareExternalTransaction } from '../external-signing/prepare-external-transaction';

export const CANTON_TRANSFER_OFFER_TEMPLATE_ID = '#splice-wallet:Splice.Wallet.TransferOffer:TransferOffer';

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
  readonly hashingSchemeVersion: string;
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
  readonly hashingSchemeVersion?: string;
  readonly submissionId?: string;
}

export interface SubmittedExternalPartyTransferOfferAcceptance extends ExecuteExternalTransactionAndWaitResult {
  readonly acceptingPartyId: string;
}

/**
 * Prepares `TransferOffer_Accept` for an externally hosted party.
 *
 * The returned `preparedTransactionHashHex` is the value the end-user key must sign outside the SDK. The helper fetches
 * the transfer-offer disclosed contract from the validator wallet API when available and falls back to Ledger active
 * contracts for the provider/source party.
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
    ? { contract: options.disclosedContract, raw: { source: 'caller' } }
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
    verboseHashing: options.verboseHashing ?? false,
    packageIdSelectionPreference: [],
  });

  return {
    offerContractId: options.offerContractId,
    acceptingPartyId: options.acceptingPartyId,
    commandId: prepared.commandId,
    synchronizerId,
    preparedTransaction: readRequiredString(prepared, 'preparedTransaction', 'transfer-offer accept prepare'),
    preparedTransactionHashHex: preparedTransactionHashToHex(
      readRequiredString(prepared, 'preparedTransactionHash', 'transfer-offer accept prepare'),
      'transfer-offer accept prepare'
    ),
    hashingSchemeVersion: readOptionalString(prepared, 'hashingSchemeVersion') ?? 'HASHING_SCHEME_VERSION_V2',
    offerDisclosure,
    raw: objectOrEmpty(prepared),
  };
}

/** Verifies the end-user signature and executes a prepared `TransferOffer_Accept`, waiting for the update id. */
export async function submitExternalPartyTransferOfferAcceptance(
  options: SubmitExternalPartyTransferOfferAcceptanceOptions
): Promise<SubmittedExternalPartyTransferOfferAcceptance> {
  validateRequiredString('userId', options.userId);
  const publicKeyFingerprint = assertCantonPartyMatchesPublicKey({
    partyId: options.acceptingPartyId,
    publicKeyBase64: options.publicKeyBase64,
    ...(options.publicKeyFingerprint !== undefined ? { publicKeyFingerprint: options.publicKeyFingerprint } : {}),
  });
  assertCantonHashSignature({
    publicKeyBase64: options.publicKeyBase64,
    hashHex: options.preparedTransactionHashHex,
    signatureBase64: options.signatureBase64,
  });

  const result = await executeExternalTransactionAndWait({
    ledgerClient: options.ledgerClient,
    userId: options.userId,
    preparedTransaction: options.preparedTransaction,
    hashingSchemeVersion: options.hashingSchemeVersion ?? 'HASHING_SCHEME_VERSION_V2',
    submissionId: options.submissionId ?? randomUUID(),
    partySignatures: [
      {
        party: options.acceptingPartyId,
        signatures: [
          {
            signature: options.signatureBase64,
            signedBy: publicKeyFingerprint,
            format: CANTON_RAW_SIGNATURE_FORMAT,
            signingAlgorithmSpec: CANTON_ED25519_SIGNATURE_ALGORITHM,
          },
        ],
      },
    ],
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

  const disclosed = readTransferOfferDisclosedContractFromActiveContracts(activeContracts, input.offerContractId);
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
  offerContractId: string
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
    if (!createdEventBlob || !synchronizerId) return null;
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
  const contractId = readFirstString(records, ['contractId', 'contract_id']);
  if (contractId !== offerContractId) return null;
  const createdEventBlob = readFirstString(records, ['createdEventBlob', 'created_event_blob']);
  if (!createdEventBlob) return null;
  const templateId = readFirstString(records, ['templateId', 'template_id']) ?? CANTON_TRANSFER_OFFER_TEMPLATE_ID;
  const synchronizerId =
    readFirstString(records, ['synchronizerId', 'synchronizer_id', 'domainId', 'domain_id']) ?? defaultSynchronizerId;

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

async function readRequiredConnectedSynchronizerId(
  ledgerClient: LedgerJsonApiClient,
  providerPartyId: string
): Promise<string> {
  const raw = await ledgerClient.getConnectedSynchronizers({ party: providerPartyId });
  const synchronizerId = parseRequiredSingleSynchronizerId(raw);
  if (synchronizerId) return synchronizerId;
  throw new OperationError(
    'Canton provider did not report a connected synchronizer',
    OperationErrorCode.MISSING_DOMAIN_ID
  );
}

function parseRequiredSingleSynchronizerId(raw: unknown): string | null {
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
      synchronizerIds.push(item);
      continue;
    }
    if (!isRecord(item)) {
      continue;
    }
    for (const key of ['synchronizerId', 'synchronizer', 'domainId', 'id']) {
      const value = item[key];
      if (typeof value === 'string' && value.trim()) {
        synchronizerIds.push(value);
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

function validateRequiredString(name: string, value: string): void {
  if (!value.trim()) {
    throw new ValidationError(`${name} is required`, { [name]: value });
  }
}

function readRequiredString(source: unknown, key: string, operation: string): string {
  if (isRecord(source) && key in source) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  throw new OperationError(
    `Canton ${operation} response did not include ${key}`,
    OperationErrorCode.TRANSACTION_FAILED
  );
}

function readOptionalString(source: unknown, key: string): string | null {
  if (!isRecord(source) || !(key in source)) return null;
  const value = source[key];
  return typeof value === 'string' && value.trim() ? value : null;
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

function objectOrEmpty(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
