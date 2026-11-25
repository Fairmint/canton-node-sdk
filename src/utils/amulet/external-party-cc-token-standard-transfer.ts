import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { type LedgerJsonApiClient } from '../../clients/ledger-json-api';
import { type ValidatorApiClient } from '../../clients/validator-api';
import { OperationError, OperationErrorCode, ValidationError } from '../../core/errors';
import { isRecord } from '../../core/utils';
import { objectOrEmpty, readRequiredString } from '../canton-response-utils';
import { preparedTransactionHashToHex } from '../external-signing/canton-protocol';
import { executeExternalPartySignedTransaction } from '../external-signing/execute-external-party-signed-transaction';
import {
  type ExecuteExternalTransactionAndWaitResult,
  type InteractiveSubmissionHashingSchemeVersion,
} from '../external-signing/execute-external-transaction';
import { prepareExternalTransaction } from '../external-signing/prepare-external-transaction';
import { assertSingleConnectedSynchronizerId } from '../party-readiness';
import { TOKEN_STANDARD_V1_REASON_META_KEY } from '../token-standard/v1/constants';
import { listTokenStandardV1Holdings, TOKEN_STANDARD_V1_AMOUNT_DECIMALS } from '../token-standard/v1/holdings';
import {
  buildTokenStandardV1TransferCommand,
  type TokenStandardV1InstrumentId,
  type TokenStandardV1Transfer,
} from '../token-standard/v1/transfer-factory';

/** Canton Coin's token-standard instrument id (its admin is the DSO party). */
export const CANTON_COIN_TOKEN_STANDARD_INSTRUMENT_ID = 'Amulet';

/** The choice-context key under which Splice's Amulet registry passes the receiver's `TransferPreapproval`. */
export const AMULET_TRANSFER_PREAPPROVAL_CONTEXT_KEY = 'transfer-preapproval';

/** How long a prepared CC transfer stays executable by default (`executeBefore`): 10 minutes. */
export const DEFAULT_CC_TOKEN_STANDARD_TRANSFER_TTL_MS = 10 * 60 * 1000;

/**
 * How far `requestedAt` is set in the past by default (60 seconds), so ledger time skew between the provider and the
 * participant does not make the transfer look requested in the future.
 */
export const DEFAULT_CC_TOKEN_STANDARD_TRANSFER_REQUESTED_AT_SKEW_MS = 60 * 1000;

/** Default cap on the number of holdings a CC transfer spends as inputs. */
export const DEFAULT_CC_TOKEN_STANDARD_TRANSFER_MAX_INPUT_HOLDINGS = 100;

/** Reasons carried in a refused CC token-standard transfer's `ValidationError` context (`context.reason`). */
export const CcTokenStandardTransferRefusal = {
  /** The receiver has no `TransferPreapproval`: the registry would only create a pending offer that locks funds. */
  receiverHasNoTransferPreapproval: 'receiver_has_no_transfer_preapproval',
  /**
   * The registry chose an `offer`, whose acceptance deadline is the transfer's `executeBefore`, and the caller left
   * `executeBefore` to its 10-minute default: the receiver would have about 10 minutes to accept.
   */
  offerRequiresExplicitExecuteBefore: 'offer_requires_explicit_execute_before',
  /** The sender's unlocked CC holdings (up to the input cap) do not cover the amount. */
  insufficientBalance: 'insufficient_cc_balance',
  /** A registry-disclosed contract lives on another synchronizer than the sender. */
  synchronizerMismatch: 'synchronizer_mismatch',
} as const;

export type CcTokenStandardTransferRefusalReason =
  (typeof CcTokenStandardTransferRefusal)[keyof typeof CcTokenStandardTransferRefusal];

export type CcTokenStandardTransferKind = 'self' | 'direct' | 'offer';

export interface PrepareExternalPartyCcTokenStandardTransferOptions {
  readonly ledgerClient: LedgerJsonApiClient;
  /** Used for the DSO party (unless `dsoPartyId` is given) and the registry's transfer factory (via its scan proxy). */
  readonly validatorClient: ValidatorApiClient;
  /** Ledger user that prepares (and later executes) the transaction; it needs `actAs` and `readAs` on the sender. */
  readonly userId: string;
  readonly senderPartyId: string;
  readonly receiverPartyId: string;
  /** Positive decimal amount of CC, at most 10 decimal places. */
  readonly amount: string;
  /** The transfer's reason (`splice.lfdecentralizedtrust.org/reason`), shown to the receiver. Empty: no reason. */
  readonly description?: string | null;
  /**
   * Default `true`: refuse unless the registry chooses a `direct` transfer (the receiver has a `TransferPreapproval`).
   * Without one, the registry would create a pending transfer offer that locks the sender's funds until the receiver
   * accepts or it expires. Set `false` to allow `offer` (and `self`) transfers; an `offer` also needs an explicit
   * `executeBefore`.
   */
  readonly requirePreapproval?: boolean;
  /**
   * Deadline for executing the transfer. Default: now + 10 minutes.
   *
   * For an `offer` transfer, Splice also uses it as the offer's expiry: the receiver must accept before it, and the
   * sender's funds stay locked until then. An `offer` is therefore refused unless this is given explicitly (choose the
   * acceptance window, e.g. 24 hours); the signed transfer must still be executed before it.
   */
  readonly executeBefore?: Date | string;
  /** The transfer's request time. Default: now - 60 seconds. */
  readonly requestedAt?: Date | string;
  /** Default: `cc-transfer-<uuid>`. */
  readonly commandId?: string;
  /** Skips the validator's DSO party lookup. */
  readonly dsoPartyId?: string;
  /** Cap on the number of input holdings. Default 100. */
  readonly maxInputHoldings?: number;
  readonly verboseHashing?: boolean;
  /** Clock for the default `requestedAt` and `executeBefore` (milliseconds since the epoch). */
  readonly now?: () => number;
}

export interface PreparedExternalPartyCcTokenStandardTransfer {
  readonly senderPartyId: string;
  readonly receiverPartyId: string;
  readonly amount: string;
  readonly commandId: string;
  readonly synchronizerId: string;
  readonly transferKind: CcTokenStandardTransferKind;
  /** The DSO party, the instrument's admin. */
  readonly instrumentAdmin: string;
  readonly inputHoldingCids: readonly string[];
  readonly requestedAt: string;
  readonly executeBefore: string;
  readonly preparedTransaction: string;
  /** The value the sender's key signs (multihash hex of the prepared transaction). */
  readonly preparedTransactionHashHex: string;
  readonly hashingSchemeVersion: InteractiveSubmissionHashingSchemeVersion;
  readonly hashingDetails: string | null;
  readonly raw: Record<string, unknown>;
}

export interface SubmitExternalPartyCcTokenStandardTransferOptions {
  readonly ledgerClient: LedgerJsonApiClient;
  /** The same ledger user that prepared the transfer. */
  readonly userId: string;
  readonly senderPartyId: string;
  readonly publicKeyBase64: string;
  readonly publicKeyFingerprint?: string | null;
  readonly preparedTransaction: string;
  readonly preparedTransactionHashHex: string;
  readonly signatureBase64: string;
  readonly hashingSchemeVersion?: InteractiveSubmissionHashingSchemeVersion;
  readonly submissionId?: string;
}

export interface SubmittedExternalPartyCcTokenStandardTransfer extends ExecuteExternalTransactionAndWaitResult {
  readonly senderPartyId: string;
}

/**
 * Prepares a Canton Coin transfer from an externally hosted party as a token-standard `TransferFactory_Transfer`,
 * through Ledger JSON API interactive submission.
 *
 * This replaces the validator's external-party `TransferCommand` endpoints (`prepare-send` / `submit-send`), which
 * Splice 0.8.0 removed. The steps:
 *
 * 1. Reads the DSO party and the sender's synchronizer.
 * 2. Takes the sender's unlocked CC holdings, largest first, until they cover the amount (at most `maxInputHoldings`).
 *    Holding fees are charged only when a holding expires, so a holding's view amount is what it pays. Taking only what
 *    is needed keeps the transaction small and leaves the sender's other holdings free for concurrent transfers; the
 *    ledger returns the change to the sender.
 * 3. Asks the registry (validator scan proxy) for the transfer factory and its choice context, and refuses, before
 *    anything is prepared, a transfer the registry would not make directly (see `requirePreapproval`).
 * 4. Prepares the exercise with the sender as the only `actAs` party and returns the hash the sender's key must sign.
 *
 * @throws ValidationError for invalid input, an insufficient balance, a receiver without a transfer preapproval (unless
 *   `requirePreapproval` is `false`), or a registry context on another synchronizer
 */
export async function prepareExternalPartyCcTokenStandardTransfer(
  options: PrepareExternalPartyCcTokenStandardTransferOptions
): Promise<PreparedExternalPartyCcTokenStandardTransfer> {
  const userId = requireNonEmpty('userId', options.userId);
  const senderPartyId = requireNonEmpty('senderPartyId', options.senderPartyId);
  const receiverPartyId = requireNonEmpty('receiverPartyId', options.receiverPartyId);
  const amountBaseUnits = parseCcAmountBaseUnits(options.amount);
  const amount = formatCcBaseUnits(amountBaseUnits);
  const description = options.description?.trim() ?? '';
  const maxInputHoldings = options.maxInputHoldings ?? DEFAULT_CC_TOKEN_STANDARD_TRANSFER_MAX_INPUT_HOLDINGS;
  if (!Number.isSafeInteger(maxInputHoldings) || maxInputHoldings < 1) {
    throw new ValidationError('maxInputHoldings must be a positive safe integer', { maxInputHoldings });
  }
  const nowMs = (options.now ?? Date.now)();
  const requestedAt = normalizeTimestamp(
    'requestedAt',
    options.requestedAt ?? new Date(nowMs - DEFAULT_CC_TOKEN_STANDARD_TRANSFER_REQUESTED_AT_SKEW_MS)
  );
  const executeBefore = normalizeTimestamp(
    'executeBefore',
    options.executeBefore ?? new Date(nowMs + DEFAULT_CC_TOKEN_STANDARD_TRANSFER_TTL_MS)
  );
  if (Date.parse(executeBefore) <= nowMs || Date.parse(executeBefore) <= Date.parse(requestedAt)) {
    throw new ValidationError('executeBefore must be in the future and after requestedAt', {
      requestedAt,
      executeBefore,
    });
  }
  const commandId = options.commandId?.trim() ? options.commandId.trim() : `cc-transfer-${randomUUID()}`;

  const dsoPartyId = options.dsoPartyId?.trim() ? options.dsoPartyId.trim() : await readDsoPartyId(options);
  const instrumentId: TokenStandardV1InstrumentId = {
    admin: dsoPartyId,
    id: CANTON_COIN_TOKEN_STANDARD_INSTRUMENT_ID,
  };
  const synchronizerId = assertSingleConnectedSynchronizerId(
    await options.ledgerClient.getConnectedSynchronizers({ party: senderPartyId })
  );
  const { offset: activeAtOffset } = await options.ledgerClient.getLedgerEnd({});
  if (typeof activeAtOffset !== 'number' || !Number.isSafeInteger(activeAtOffset) || activeAtOffset < 0) {
    throw new OperationError(
      'Canton ledger end response did not include an offset',
      OperationErrorCode.TRANSACTION_FAILED
    );
  }

  const inputs = await selectCoveringUnlockedCcHoldings({
    ledgerClient: options.ledgerClient,
    senderPartyId,
    instrumentId,
    synchronizerId,
    activeAtOffset,
    maxInputHoldings,
    amountBaseUnits,
  });
  if (inputs.totalBaseUnits < amountBaseUnits) {
    throw new ValidationError('Insufficient CC balance for this transfer', {
      reason: CcTokenStandardTransferRefusal.insufficientBalance,
      senderPartyId,
      amount,
      availableAmount: formatCcBaseUnits(inputs.totalBaseUnits),
      inputHoldingCount: inputs.contractIds.length,
      maxInputHoldings,
    });
  }

  const meta: Record<string, string> = description ? { [TOKEN_STANDARD_V1_REASON_META_KEY]: description } : {};
  const transfer: TokenStandardV1Transfer = {
    sender: senderPartyId,
    receiver: receiverPartyId,
    amount,
    instrumentId,
    requestedAt,
    executeBefore,
    inputHoldingCids: inputs.contractIds,
    meta: { values: meta },
  };

  const factory = await readTransferFactory({
    validatorClient: options.validatorClient,
    choiceArguments: {
      expectedAdmin: dsoPartyId,
      transfer: {
        sender: senderPartyId,
        receiver: receiverPartyId,
        amount,
        instrumentId: { admin: instrumentId.admin, id: instrumentId.id },
        requestedAt,
        executeBefore,
        inputHoldingCids: [...inputs.contractIds],
        meta: { values: { ...meta } },
      },
      extraArgs: { context: { values: {} }, meta: { values: {} } },
    },
  });

  if (options.requirePreapproval !== false && factory.transferKind !== 'direct') {
    throw new ValidationError('Canton CC receiver has no transfer preapproval', {
      reason: CcTokenStandardTransferRefusal.receiverHasNoTransferPreapproval,
      receiverPartyId,
      transferKind: factory.transferKind,
    });
  }
  if (factory.transferKind === 'offer' && options.executeBefore === undefined) {
    // Splice's two-step transfer locks the sender's funds until `executeBefore` and lets the receiver accept only
    // before it (AmuletTransferInstruction `transferBefore = executeBefore`), so a silent 10-minute default would make
    // the offer all but unacceptable.
    throw new ValidationError('Canton CC transfer offer needs an explicit executeBefore (the offer expiry)', {
      reason: CcTokenStandardTransferRefusal.offerRequiresExplicitExecuteBefore,
      receiverPartyId,
      transferKind: factory.transferKind,
      executeBefore,
    });
  }
  if (factory.transferKind === 'direct' && !(AMULET_TRANSFER_PREAPPROVAL_CONTEXT_KEY in factory.contextValues)) {
    throw new ValidationError('Canton CC registry chose a direct transfer without the receiver transfer preapproval', {
      reason: CcTokenStandardTransferRefusal.receiverHasNoTransferPreapproval,
      receiverPartyId,
      transferKind: factory.transferKind,
    });
  }
  for (const disclosed of factory.disclosedContracts) {
    if (disclosed.synchronizerId !== synchronizerId) {
      throw new ValidationError('Canton CC registry disclosed a contract on another synchronizer than the sender', {
        reason: CcTokenStandardTransferRefusal.synchronizerMismatch,
        contractId: disclosed.contractId,
        disclosedSynchronizerId: disclosed.synchronizerId,
        synchronizerId,
      });
    }
  }

  const prepared = await prepareExternalTransaction({
    ledgerClient: options.ledgerClient,
    commands: [
      buildTokenStandardV1TransferCommand({
        transferFactoryContractId: factory.factoryId,
        expectedAdmin: dsoPartyId,
        transfer,
        extraArgs: { context: { values: factory.contextValues }, meta: { values: {} } },
      }),
    ],
    commandId,
    userId,
    actAs: [senderPartyId],
    readAs: [senderPartyId],
    synchronizerId,
    hashingSchemeVersion: 'HASHING_SCHEME_VERSION_V2',
    disclosedContracts: factory.disclosedContracts.map((contract) => ({ ...contract })),
    verboseHashing: options.verboseHashing ?? false,
    packageIdSelectionPreference: [],
  });
  const raw = objectOrEmpty(prepared);
  const { hashingDetails } = raw;

  return {
    senderPartyId,
    receiverPartyId,
    amount,
    commandId: prepared.commandId,
    synchronizerId,
    transferKind: factory.transferKind,
    instrumentAdmin: dsoPartyId,
    inputHoldingCids: inputs.contractIds,
    requestedAt,
    executeBefore,
    preparedTransaction: readRequiredString(prepared, 'preparedTransaction', 'CC transfer prepare'),
    preparedTransactionHashHex: preparedTransactionHashToHex(
      readRequiredString(prepared, 'preparedTransactionHash', 'CC transfer prepare'),
      'CC transfer prepare'
    ),
    hashingSchemeVersion: prepared.hashingSchemeVersion,
    hashingDetails: typeof hashingDetails === 'string' && hashingDetails.trim() ? hashingDetails : null,
    raw,
  };
}

/**
 * Verifies the sender's signature and executes a CC transfer prepared by
 * {@link prepareExternalPartyCcTokenStandardTransfer}, waiting for the update id.
 */
export async function submitExternalPartyCcTokenStandardTransfer(
  options: SubmitExternalPartyCcTokenStandardTransferOptions
): Promise<SubmittedExternalPartyCcTokenStandardTransfer> {
  const result = await executeExternalPartySignedTransaction({
    ledgerClient: options.ledgerClient,
    userId: options.userId,
    partyId: options.senderPartyId,
    publicKeyBase64: options.publicKeyBase64,
    ...(options.publicKeyFingerprint !== undefined ? { publicKeyFingerprint: options.publicKeyFingerprint } : {}),
    preparedTransaction: options.preparedTransaction,
    preparedTransactionHashHex: options.preparedTransactionHashHex,
    signatureBase64: options.signatureBase64,
    hashingSchemeVersion: options.hashingSchemeVersion ?? 'HASHING_SCHEME_VERSION_V2',
    ...(options.submissionId !== undefined ? { submissionId: options.submissionId } : {}),
  });
  return { ...result, senderPartyId: options.senderPartyId };
}

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

interface TransferFactoryChoice {
  readonly factoryId: string;
  readonly transferKind: CcTokenStandardTransferKind;
  readonly contextValues: Readonly<Record<string, unknown>>;
  readonly disclosedContracts: ReadonlyArray<{
    readonly templateId: string;
    readonly contractId: string;
    readonly createdEventBlob: string;
    readonly synchronizerId: string;
  }>;
}

/**
 * The parts of a registry transfer-factory answer this flow uses. Lenient on purpose: the registry may send `null`
 * debug fields even with `excludeDebugFields`, and they are dropped anyway.
 */
const TransferFactoryResponseSchema = z.object({
  factoryId: z.string().trim().min(1),
  transferKind: z.enum(['self', 'direct', 'offer']),
  choiceContext: z.object({
    choiceContextData: z.object({ values: z.record(z.string(), z.unknown()) }),
    disclosedContracts: z.array(
      z.object({
        templateId: z.string().min(1),
        contractId: z.string().min(1),
        createdEventBlob: z.string().min(1),
        synchronizerId: z.string().min(1),
      })
    ),
  }),
});

async function readTransferFactory(input: {
  readonly validatorClient: ValidatorApiClient;
  readonly choiceArguments: Record<string, JsonValue>;
}): Promise<TransferFactoryChoice> {
  const response: unknown = await input.validatorClient.getTransferFactory({
    choiceArguments: input.choiceArguments,
    excludeDebugFields: true,
  });
  const parsed = TransferFactoryResponseSchema.safeParse(response);
  if (!parsed.success) {
    throw new OperationError(
      'Canton CC registry transfer-factory response was invalid',
      OperationErrorCode.TRANSACTION_FAILED,
      { issues: parsed.error.message }
    );
  }
  const { factoryId, transferKind, choiceContext } = parsed.data;
  const { values } = choiceContext.choiceContextData;
  return {
    factoryId,
    transferKind,
    contextValues: values,
    // Keep only what the participant needs; the registry's debug fields are diagnostics.
    disclosedContracts: choiceContext.disclosedContracts.map(
      ({ templateId, contractId, createdEventBlob, synchronizerId }) => ({
        templateId,
        contractId,
        createdEventBlob,
        synchronizerId,
      })
    ),
  };
}

async function selectCoveringUnlockedCcHoldings(input: {
  readonly ledgerClient: LedgerJsonApiClient;
  readonly senderPartyId: string;
  readonly instrumentId: TokenStandardV1InstrumentId;
  readonly synchronizerId: string;
  readonly activeAtOffset: number;
  readonly maxInputHoldings: number;
  readonly amountBaseUnits: bigint;
}): Promise<{ readonly contractIds: readonly string[]; readonly totalBaseUnits: bigint }> {
  const holdings = await listTokenStandardV1Holdings({
    ledger: input.ledgerClient,
    parties: [input.senderPartyId],
    owner: input.senderPartyId,
    instrumentId: input.instrumentId,
    instrumentDecimals: TOKEN_STANDARD_V1_AMOUNT_DECIMALS,
    synchronizerId: input.synchronizerId,
    activeAtOffset: input.activeAtOffset,
  });
  const candidates = holdings
    // The HoldingV1 view is whatever its template says: anyone can create a look-alike that names the sender as owner.
    // A real Amulet is signed by the instrument admin (the DSO) and the owner, so only those are inputs.
    .filter(
      (holding) =>
        holding.lock === null &&
        BigInt(holding.amountBaseUnits) > 0n &&
        holding.signatories.includes(input.instrumentId.admin) &&
        holding.signatories.includes(input.senderPartyId)
    )
    .sort((left, right) => {
      const difference = BigInt(right.amountBaseUnits) - BigInt(left.amountBaseUnits);
      if (difference !== 0n) return difference > 0n ? 1 : -1;
      return left.contractId.localeCompare(right.contractId);
    });
  const contractIds: string[] = [];
  let totalBaseUnits = 0n;
  for (const holding of candidates) {
    if (totalBaseUnits >= input.amountBaseUnits || contractIds.length >= input.maxInputHoldings) break;
    contractIds.push(holding.contractId);
    totalBaseUnits += BigInt(holding.amountBaseUnits);
  }
  return { contractIds, totalBaseUnits };
}

async function readDsoPartyId(options: PrepareExternalPartyCcTokenStandardTransferOptions): Promise<string> {
  const response: unknown = await options.validatorClient.getDsoPartyId();
  const dsoPartyId = isRecord(response) ? response['dso_party_id'] : undefined;
  if (typeof dsoPartyId !== 'string' || !dsoPartyId.trim()) {
    throw new OperationError('Canton validator did not return the DSO party id', OperationErrorCode.TRANSACTION_FAILED);
  }
  return dsoPartyId.trim();
}

const CC_AMOUNT_PATTERN = /^(\d+)(?:\.(\d+))?$/;
const CC_SCALE = 10n ** BigInt(TOKEN_STANDARD_V1_AMOUNT_DECIMALS);

function parseCcAmountBaseUnits(amount: string): bigint {
  const match = typeof amount === 'string' ? CC_AMOUNT_PATTERN.exec(amount.trim()) : null;
  const whole = match?.[1];
  const fraction = trimTrailingZeros(match?.[2] ?? '');
  if (!match || whole === undefined || fraction.length > TOKEN_STANDARD_V1_AMOUNT_DECIMALS) {
    throw new ValidationError(
      `amount must be a positive decimal amount with at most ${TOKEN_STANDARD_V1_AMOUNT_DECIMALS} decimal places`,
      { amount }
    );
  }
  const baseUnits = BigInt(whole) * CC_SCALE + BigInt(fraction.padEnd(TOKEN_STANDARD_V1_AMOUNT_DECIMALS, '0'));
  if (baseUnits <= 0n) {
    throw new ValidationError('amount must be a positive decimal amount', { amount });
  }
  return baseUnits;
}

function formatCcBaseUnits(baseUnits: bigint): string {
  const whole = baseUnits / CC_SCALE;
  const fraction = (baseUnits % CC_SCALE).toString().padStart(TOKEN_STANDARD_V1_AMOUNT_DECIMALS, '0');
  const trimmed = trimTrailingZeros(fraction);
  return trimmed ? `${whole.toString()}.${trimmed}` : whole.toString();
}

/** Drops trailing `0`s in linear time (a `/0+$/` replace backtracks polynomially on long runs of zeros). */
function trimTrailingZeros(digits: string): string {
  let end = digits.length;
  while (end > 0 && digits.charCodeAt(end - 1) === 48) end -= 1;
  return digits.slice(0, end);
}

function normalizeTimestamp(name: string, value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ValidationError(`${name} must be a valid timestamp`, { [name]: String(value) });
  }
  return date.toISOString();
}

function requireNonEmpty(name: string, value: string): string {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed) {
    throw new ValidationError(`${name} is required`, { [name]: value });
  }
  return trimmed;
}
