import type { LedgerJsonApiClient } from '../../src/clients/ledger-json-api';
import type {
  InteractiveSubmissionCommand,
  InteractiveSubmissionEvent,
  InteractiveSubmissionExternalTransactionHashHex,
  InteractiveSubmissionIdentifierFilter,
  InteractiveSubmissionProtoAny,
  InteractiveSubmissionSignature,
  InteractiveSubmissionTraceContext,
} from '../../src/clients/ledger-json-api/schemas/api/interactive-submission';
import type {
  ExecuteExternalTransactionOptions,
  NonEmptyPartySignatures,
  PartySignature,
} from '../../src/utils/external-signing/execute-external-transaction';
import type {
  NonEmptyActAsParties,
  NonEmptyPrepareExternalTransactionCommands,
} from '../../src/utils/external-signing/prepare-external-transaction';
import type { EstimateTrafficCostOptions } from '../../src/utils/traffic/estimate-traffic-cost';
import type { TrafficCostEstimate } from '../../src/utils/traffic/types';

declare const ledgerClient: LedgerJsonApiClient;

type ExecuteAndWaitRequest = Parameters<LedgerJsonApiClient['interactiveSubmissionExecuteAndWait']>[0];
type ExecuteRequest = Parameters<LedgerJsonApiClient['interactiveSubmissionExecute']>[0];
type ExecuteAndWaitResponse = Awaited<ReturnType<LedgerJsonApiClient['interactiveSubmissionExecuteAndWait']>>;
type PrepareRequest = Parameters<LedgerJsonApiClient['interactiveSubmissionPrepare']>[0];
type PrepareResponse = Awaited<ReturnType<LedgerJsonApiClient['interactiveSubmissionPrepare']>>;
type ExecuteAndWaitForTransactionRequest = Parameters<
  LedgerJsonApiClient['interactiveSubmissionExecuteAndWaitForTransaction']
>[0];
type ExecuteAndWaitForTransactionResponse = Awaited<
  ReturnType<LedgerJsonApiClient['interactiveSubmissionExecuteAndWaitForTransaction']>
>;
type PrepareOptions = Parameters<LedgerJsonApiClient['interactiveSubmissionPrepare']>[1];
type ExecuteOptions = Parameters<LedgerJsonApiClient['interactiveSubmissionExecute']>[1];
type ExecuteAndWaitOptions = Parameters<LedgerJsonApiClient['interactiveSubmissionExecuteAndWait']>[1];
type ExecuteAndWaitForTransactionOptions = Parameters<
  LedgerJsonApiClient['interactiveSubmissionExecuteAndWaitForTransaction']
>[1];
type PreferredPackageVersionRequest = Parameters<
  LedgerJsonApiClient['interactiveSubmissionGetPreferredPackageVersion']
>[0];
type PreferredPackageVersionOptions = Parameters<
  LedgerJsonApiClient['interactiveSubmissionGetPreferredPackageVersion']
>[1];
type PreferredPackagesRequest = Parameters<LedgerJsonApiClient['interactiveSubmissionGetPreferredPackages']>[0];
type PreferredPackagesOptions = Parameters<LedgerJsonApiClient['interactiveSubmissionGetPreferredPackages']>[1];
type PreferredPackagesResponse = Awaited<ReturnType<LedgerJsonApiClient['interactiveSubmissionGetPreferredPackages']>>;
type PreferredPackageVersionResponse = Awaited<
  ReturnType<LedgerJsonApiClient['interactiveSubmissionGetPreferredPackageVersion']>
>;

const executeAndWaitRequest: ExecuteAndWaitRequest = {
  preparedTransaction: 'prepared-transaction',
  partySignatures: {
    signatures: [
      {
        party: 'party::fingerprint',
        signatures: [
          {
            format: 'SIGNATURE_FORMAT_RAW',
            signature: 'signature',
            signedBy: 'fingerprint',
            signingAlgorithmSpec: 'SIGNING_ALGORITHM_SPEC_ED25519',
          },
        ],
      },
    ],
  },
  submissionId: 'submission-1',
  hashingSchemeVersion: 'HASHING_SCHEME_VERSION_V3',
  deduplicationPeriod: {
    DeduplicationOffset: { value: 42 },
  },
  minLedgerTime: {
    time: {
      MinLedgerTimeAbs: { value: '2026-07-09T12:00:00Z' },
    },
  },
};

const invalidHelperHashingScheme: ExecuteExternalTransactionOptions = {
  ledgerClient,
  preparedTransaction: executeAndWaitRequest.preparedTransaction,
  submissionId: executeAndWaitRequest.submissionId,
  partySignatures: executeAndWaitRequest.partySignatures.signatures,
  // @ts-expect-error External-transaction helpers accept only pinned V2 or V3 hashing schemes.
  hashingSchemeVersion: 'HASHING_SCHEME_VERSION_FUTURE',
};

const executeAndWaitForTransactionRequest: ExecuteAndWaitForTransactionRequest = {
  ...executeAndWaitRequest,
  transactionFormat: {
    eventFormat: {},
    transactionShape: 'TRANSACTION_SHAPE_ACS_DELTA',
  },
};

const unspecifiedTransactionShape: ExecuteAndWaitForTransactionRequest = {
  ...executeAndWaitRequest,
  transactionFormat: {
    eventFormat: {},
    // @ts-expect-error Canton rejects the unspecified transaction-shape sentinel.
    transactionShape: 'TRANSACTION_SHAPE_UNSPECIFIED',
  },
};

const executeAndWaitResponse: ExecuteAndWaitResponse = {
  updateId: 'update-1',
  completionOffset: 123,
};

const prepareRequest: PrepareRequest = {
  commandId: 'command-1',
  commands: [{ CreateCommand: { templateId: 'pkg:Module:Template', createArguments: {} } }],
  actAs: ['party::fingerprint'],
  packageIdSelectionPreference: ['package-id-1'],
  hashingSchemeVersion: 'HASHING_SCHEME_VERSION_V3',
};

const unspecifiedPrepareHashingScheme: PrepareRequest = {
  ...prepareRequest,
  // @ts-expect-error Canton rejects the unspecified sentinel for prepare requests.
  hashingSchemeVersion: 'HASHING_SCHEME_VERSION_UNSPECIFIED',
};

const unspecifiedCostHintSigningAlgorithm: PrepareRequest = {
  ...prepareRequest,
  estimateTrafficCost: {
    expectedSignatures: [
      // @ts-expect-error Canton rejects the unspecified cost-hint signing-algorithm sentinel.
      'SIGNING_ALGORITHM_SPEC_UNSPECIFIED',
    ],
  },
};

const prepareResponse: PrepareResponse = {
  preparedTransaction: 'prepared-transaction',
  preparedTransactionHash: 'prepared-hash',
  hashingSchemeVersion: 'HASHING_SCHEME_VERSION_V3',
};

void executeAndWaitForTransactionRequest;
void invalidHelperHashingScheme;
void unspecifiedTransactionShape;
void executeAndWaitResponse;
void prepareRequest;
void unspecifiedPrepareHashingScheme;
void unspecifiedCostHintSigningAlgorithm;
void prepareResponse;

const invalidOffsetRequest: ExecuteAndWaitRequest = {
  ...executeAndWaitRequest,
  deduplicationPeriod: {
    DeduplicationOffset: {
      // @ts-expect-error Generated Ledger offsets are numeric.
      value: '42',
    },
  },
};

const invalidHashingSchemeRequest: ExecuteAndWaitRequest = {
  ...executeAndWaitRequest,
  // @ts-expect-error Hashing scheme V1 is not part of the generated contract.
  hashingSchemeVersion: 'HASHING_SCHEME_VERSION_V1',
};

const unspecifiedHashingSchemeRequest: ExecuteAndWaitRequest = {
  ...executeAndWaitRequest,
  // @ts-expect-error Canton rejects the unspecified sentinel for execute requests.
  hashingSchemeVersion: 'HASHING_SCHEME_VERSION_UNSPECIFIED',
};

const decodedProtoAny: InteractiveSubmissionProtoAny = {
  typeUrl: 'type.googleapis.com/google.rpc.ErrorInfo',
  value: 'encoded-protobuf',
  unknownFields: { fields: {} },
  valueDecoded: {
    reason: 'TEST_REASON',
    metadata: { retryable: false, attempts: [1, null] },
  },
};

const invalidDecodedProtoAny: InteractiveSubmissionProtoAny = {
  typeUrl: 'type.googleapis.com/google.rpc.ErrorInfo',
  value: 'encoded-protobuf',
  unknownFields: { fields: {} },
  // @ts-expect-error Decoded protobuf details must remain lossless JSON values.
  valueDecoded: { invalid: () => undefined },
};

const invalidSignatureFormat: InteractiveSubmissionSignature = {
  // @ts-expect-error Signature formats are the finite pinned Canton enum.
  format: 'SIGNATURE_FORMAT_PEM',
  signature: 'signature',
  signedBy: 'fingerprint',
  signingAlgorithmSpec: 'SIGNING_ALGORITHM_SPEC_ED25519',
};

const unspecifiedSignatureFormat: InteractiveSubmissionSignature = {
  // @ts-expect-error Canton rejects the unspecified signature-format sentinel.
  format: 'SIGNATURE_FORMAT_UNSPECIFIED',
  signature: 'signature',
  signedBy: 'fingerprint',
  signingAlgorithmSpec: 'SIGNING_ALGORITHM_SPEC_ED25519',
};

const invalidSigningAlgorithm: InteractiveSubmissionSignature = {
  format: 'SIGNATURE_FORMAT_RAW',
  signature: 'signature',
  signedBy: 'fingerprint',
  // @ts-expect-error Signing algorithms are the finite pinned Canton enum.
  signingAlgorithmSpec: 'SIGNING_ALGORITHM_SPEC_RSA_SHA_256',
};

const unspecifiedSigningAlgorithm: InteractiveSubmissionSignature = {
  format: 'SIGNATURE_FORMAT_RAW',
  signature: 'signature',
  signedBy: 'fingerprint',
  // @ts-expect-error Canton rejects the unspecified signing-algorithm sentinel.
  signingAlgorithmSpec: 'SIGNING_ALGORITHM_SPEC_UNSPECIFIED',
};

type TransactionEvents = ExecuteAndWaitForTransactionResponse['transaction']['events'];
const emptyTransactionEvents: TransactionEvents = [];
type TransactionTraceContext = NonNullable<ExecuteAndWaitForTransactionResponse['transaction']['traceContext']>;
const normalizedTraceContext: InteractiveSubmissionTraceContext = {
  traceparent: '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01',
};
const normalizedTraceState: TransactionTraceContext['tracestate'] = 'vendor=value';
// @ts-expect-error Wire null trace state is normalized to an omitted property for consumers.
const nullTraceState: TransactionTraceContext['tracestate'] = null;
type TransactionExternalHash = NonNullable<
  ExecuteAndWaitForTransactionResponse['transaction']['externalTransactionHash']
>;
declare const validatedExternalHash: TransactionExternalHash;
const typedExternalHash: InteractiveSubmissionExternalTransactionHashHex = validatedExternalHash;
const rawExternalHashString: string = typedExternalHash;
// @ts-expect-error Transaction hashes are validated and branded before they reach consumers.
const unvalidatedExternalHash: TransactionExternalHash = 'ab'.repeat(32);
type CreatedTransactionEvent = Extract<TransactionEvents[number], { CreatedEvent: unknown }>['CreatedEvent'];
type ExercisedTransactionEvent = Extract<TransactionEvents[number], { ExercisedEvent: unknown }>['ExercisedEvent'];
type InterfaceView = NonNullable<CreatedTransactionEvent['interfaceViews']>[number];
// @ts-expect-error Wire null contract keys normalize to an absent property.
const nullContractKey: CreatedTransactionEvent['contractKey'] = null;
const nullInterfaceViewValue: InterfaceView['viewValue'] = null;
const createdEventArgument: CreatedTransactionEvent['createArgument'] = { owner: 'Alice', amount: 1 };
const exerciseChoiceArgument: ExercisedTransactionEvent['choiceArgument'] = { archive: true };
const exerciseResult: ExercisedTransactionEvent['exerciseResult'] = [null, 'result'];
// @ts-expect-error Created-event arguments are JSON values, not arbitrary objects.
const invalidCreatedEventArgument: CreatedTransactionEvent['createArgument'] = { invalid: () => undefined };
// @ts-expect-error Exercise choice arguments are JSON values, not arbitrary objects.
const invalidExerciseChoiceArgument: ExercisedTransactionEvent['choiceArgument'] = { invalid: 1n };
// @ts-expect-error Exercise results are JSON values when present.
const invalidExerciseResult: ExercisedTransactionEvent['exerciseResult'] = Symbol('invalid');

void normalizedTraceContext;
void normalizedTraceState;
void nullTraceState;
void rawExternalHashString;
void unvalidatedExternalHash;

type PrepareCommand = PrepareRequest['commands'][number];
type CreateArguments = Extract<PrepareCommand, { CreateCommand: unknown }>['CreateCommand']['createArguments'];
type ExerciseArguments = Extract<PrepareCommand, { ExerciseCommand: unknown }>['ExerciseCommand']['choiceArgument'];
type CreateAndExerciseArguments = Extract<
  PrepareCommand,
  { CreateAndExerciseCommand: unknown }
>['CreateAndExerciseCommand'];
type ExerciseByKeyArguments = Extract<PrepareCommand, { ExerciseByKeyCommand: unknown }>['ExerciseByKeyCommand'];
type PrefetchContractKey = NonNullable<PrepareRequest['prefetchContractKeys']>[number]['contractKey'];
const createArguments: CreateArguments = { nested: [true, null] };
const exerciseArguments: ExerciseArguments = 'choice-argument';
const createAndExerciseCreateArguments: CreateAndExerciseArguments['createArguments'] = 42;
const createAndExerciseChoiceArguments: CreateAndExerciseArguments['choiceArgument'] = { choice: 'value' };
const exerciseByKeyContractKey: ExerciseByKeyArguments['contractKey'] = ['key', 1];
const exerciseByKeyChoiceArgument: ExerciseByKeyArguments['choiceArgument'] = null;
const prefetchContractKey: PrefetchContractKey = { owner: 'Alice', key: [1, null] };
// @ts-expect-error Prepare create arguments are JSON values.
const invalidCreateArguments: CreateArguments = { invalid: undefined };
// @ts-expect-error Prepare exercise arguments are JSON values.
const invalidExerciseArguments: ExerciseArguments = { invalid: () => undefined };
// @ts-expect-error Create-and-exercise create arguments are JSON values.
const invalidCreateAndExerciseCreateArguments: CreateAndExerciseArguments['createArguments'] = { invalid: Symbol() };
// @ts-expect-error Create-and-exercise choice arguments are JSON values.
const invalidCreateAndExerciseChoiceArguments: CreateAndExerciseArguments['choiceArgument'] = { invalid: 1n };
// @ts-expect-error Exercise-by-key contract keys are JSON values.
const invalidExerciseByKeyContractKey: ExerciseByKeyArguments['contractKey'] = { invalid: () => undefined };
// @ts-expect-error Exercise-by-key choice arguments are JSON values.
const invalidExerciseByKeyChoiceArgument: ExerciseByKeyArguments['choiceArgument'] = { invalid: undefined };
// @ts-expect-error Prefetched contract keys are JSON values.
const invalidPrefetchContractKey: PrefetchContractKey = { invalid: () => undefined };

declare const createCommand: Extract<InteractiveSubmissionCommand, { CreateCommand: unknown }>['CreateCommand'];
declare const exerciseCommand: Extract<InteractiveSubmissionCommand, { ExerciseCommand: unknown }>['ExerciseCommand'];
// @ts-expect-error Interactive commands contain exactly one command branch.
const invalidMultiBranchCommand: InteractiveSubmissionCommand = {
  CreateCommand: createCommand,
  ExerciseCommand: exerciseCommand,
};

type ExecuteDeduplicationPeriod = NonNullable<ExecuteRequest['deduplicationPeriod']>;
// @ts-expect-error Deduplication periods contain exactly one branch.
const invalidMultiBranchDeduplication: ExecuteDeduplicationPeriod = {
  DeduplicationOffset: { value: 42 },
  Empty: {},
};

type ExecuteLedgerTime = NonNullable<NonNullable<ExecuteRequest['minLedgerTime']>['time']>;
// @ts-expect-error Minimum ledger time contains exactly one branch.
const invalidMultiBranchTime: ExecuteLedgerTime = {
  Empty: {},
  MinLedgerTimeAbs: { value: '2026-07-09T12:00:00Z' },
};

// @ts-expect-error Identifier filters contain exactly one branch.
const invalidMultiBranchIdentifierFilter: InteractiveSubmissionIdentifierFilter = {
  Empty: {},
  WildcardFilter: { value: {} },
};

declare const archivedEvent: Extract<InteractiveSubmissionEvent, { ArchivedEvent: unknown }>['ArchivedEvent'];
declare const createdEvent: Extract<InteractiveSubmissionEvent, { CreatedEvent: unknown }>['CreatedEvent'];
// @ts-expect-error Transaction events contain exactly one event branch.
const invalidMultiBranchEvent: InteractiveSubmissionEvent = {
  ArchivedEvent: archivedEvent,
  CreatedEvent: createdEvent,
};

void invalidOffsetRequest;
void invalidHashingSchemeRequest;
void unspecifiedHashingSchemeRequest;
void decodedProtoAny;
void invalidDecodedProtoAny;
void invalidSignatureFormat;
void unspecifiedSignatureFormat;
void invalidSigningAlgorithm;
void unspecifiedSigningAlgorithm;
void emptyTransactionEvents;
void nullContractKey;
void nullInterfaceViewValue;
void createdEventArgument;
void exerciseChoiceArgument;
void exerciseResult;
void invalidCreatedEventArgument;
void invalidExerciseChoiceArgument;
void invalidExerciseResult;
void createArguments;
void exerciseArguments;
void createAndExerciseCreateArguments;
void createAndExerciseChoiceArguments;
void exerciseByKeyContractKey;
void exerciseByKeyChoiceArgument;
void prefetchContractKey;
void invalidCreateArguments;
void invalidExerciseArguments;
void invalidCreateAndExerciseCreateArguments;
void invalidCreateAndExerciseChoiceArguments;
void invalidExerciseByKeyContractKey;
void invalidExerciseByKeyChoiceArgument;
void invalidPrefetchContractKey;
void invalidMultiBranchCommand;
void invalidMultiBranchDeduplication;
void invalidMultiBranchTime;
void invalidMultiBranchIdentifierFilter;
void invalidMultiBranchEvent;

const invalidPackagePreference: PrepareRequest = {
  ...prepareRequest,
  packageIdSelectionPreference: [
    // @ts-expect-error Package preferences are package-id strings in the pinned contract.
    { packageId: 'package-id-1' },
  ],
};

// @ts-expect-error The prepared transaction is required by the pinned response contract.
const incompletePrepareResponse: PrepareResponse = {
  preparedTransactionHash: 'prepared-hash',
  hashingSchemeVersion: 'HASHING_SCHEME_VERSION_V3',
};

void invalidPackagePreference;
void incompletePrepareResponse;

type Assert<Condition extends true> = Condition;
type IsRequired<Container, Key extends keyof Container> = {} extends Pick<Container, Key> ? false : true;

export type TrafficEstimateRequiresHashingScheme = Assert<
  IsRequired<EstimateTrafficCostOptions, 'hashingSchemeVersion'>
>;

// These methods were invented locally and do not exist in the pinned Ledger API.
// @ts-expect-error Phantom allocate-party method was removed.
ledgerClient.interactiveSubmissionAllocateParty;
// @ts-expect-error Phantom create-user method was removed.
ledgerClient.interactiveSubmissionCreateUser;
// @ts-expect-error Phantom upload-DAR method was removed.
ledgerClient.interactiveSubmissionUploadDar;

// The exact executeAndWait response has no fabricated raw response field.
// @ts-expect-error No raw field exists in ExecuteSubmissionAndWaitResponse.
executeAndWaitResponse.raw;

// @ts-expect-error At least one per-party signature group is required by the helper.
const emptyPartySignatures: NonEmptyPartySignatures = [];

// @ts-expect-error Each party signature group must contain at least one signature.
const partyWithoutSignatures: PartySignature = { party: 'party::fingerprint', signatures: [] };

type RawPartySignatureGroups = ExecuteRequest['partySignatures']['signatures'];
// @ts-expect-error The raw execute endpoint requires at least one party-signature group.
const emptyRawPartySignatureGroups: RawPartySignatureGroups = [];
type RawSignatures = RawPartySignatureGroups[number]['signatures'];
// @ts-expect-error Each raw party-signature group requires at least one signature.
const emptyRawSignatures: RawSignatures = [];

// @ts-expect-error The raw prepare endpoint requires at least one command.
const emptyRawPrepareCommands: PrepareRequest['commands'] = [];
// @ts-expect-error Pinned Canton interactive preparation accepts exactly one command.
const multipleRawPrepareCommands: PrepareRequest['commands'] = [createCommand, createCommand];
// @ts-expect-error The raw prepare endpoint requires at least one acting party.
const emptyRawActAs: PrepareRequest['actAs'] = [];

// @ts-expect-error At least one prepare command is required by the helper.
const emptyPrepareCommands: NonEmptyPrepareExternalTransactionCommands = [];
// @ts-expect-error The helper preserves the pinned one-command interactive contract.
const multiplePrepareCommands: NonEmptyPrepareExternalTransactionCommands = [createCommand, createCommand];

// @ts-expect-error At least one actAs party is required by the helper.
const emptyActAsParties: NonEmptyActAsParties = [];

declare const signal: AbortSignal;

const prepareOptions: PrepareOptions = {
  signal,
  retry: { kind: 'exact-body', maxAttempts: 2 },
};
const executeOptions: ExecuteOptions = {
  signal,
  retry: {
    kind: 'derived-body',
    maxAttempts: 2,
    deriveParams: ({ params }) => ({ ...params, submissionId: 'submission-2' }),
  },
};
const executeAndWaitOptions: ExecuteAndWaitOptions = {
  signal,
  retry: {
    kind: 'derived-body',
    maxAttempts: 2,
    deriveParams: ({ params }) => ({ ...params, submissionId: 'submission-2' }),
  },
};
const executeAndWaitForTransactionOptions: ExecuteAndWaitForTransactionOptions = {
  signal,
  retry: {
    kind: 'derived-body',
    maxAttempts: 2,
    deriveParams: ({ params }) => ({ ...params, submissionId: 'submission-2' }),
  },
};

const invalidExecuteExactBodyOptions: ExecuteOptions = {
  // @ts-expect-error Execute retries must derive a fresh submission ID.
  retry: { kind: 'exact-body', maxAttempts: 2 },
};
const invalidExecuteAndWaitExactBodyOptions: ExecuteAndWaitOptions = {
  // @ts-expect-error Execute-and-wait retries must derive a fresh submission ID.
  retry: { kind: 'exact-body', maxAttempts: 2 },
};
const invalidExecuteAndWaitForTransactionExactBodyOptions: ExecuteAndWaitForTransactionOptions = {
  // @ts-expect-error Transaction-returning execute retries must derive a fresh submission ID.
  retry: { kind: 'exact-body', maxAttempts: 2 },
};

void ledgerClient.interactiveSubmissionPrepare(prepareRequest, prepareOptions);
void ledgerClient.interactiveSubmissionExecute(executeAndWaitRequest, executeOptions);
void ledgerClient.interactiveSubmissionExecuteAndWait(executeAndWaitRequest, executeAndWaitOptions);
void ledgerClient.interactiveSubmissionExecuteAndWaitForTransaction(
  executeAndWaitForTransactionRequest,
  executeAndWaitForTransactionOptions
);

const preferredPackagesRequest: PreferredPackagesRequest = {
  packageVettingRequirements: [{ packageName: 'quickstart-licensing', parties: ['party::fingerprint'] }],
};
const preferredPackageVersionRequest: PreferredPackageVersionRequest = {
  packageName: 'quickstart-licensing',
  parties: ['party::fingerprint'],
};
const preferredPackageVersionOptions: PreferredPackageVersionOptions = {
  signal,
  retry: { kind: 'none' },
};
const preferredPackagesOptions: PreferredPackagesOptions = {
  signal,
  retry: {
    kind: 'derived-body',
    maxAttempts: 2,
    deriveParams: ({ params }) => params,
  },
};
const preferredPackagesResponse: PreferredPackagesResponse = {
  packageReferences: [{ packageId: 'package-id', packageName: 'quickstart-licensing', packageVersion: '1.0.0' }],
  synchronizerId: 'synchronizer::id',
};
const absentPreferredPackage: PreferredPackageVersionResponse = {};
// @ts-expect-error Public responses normalize wire null into an absent optional property.
const wireNullPreferredPackage: PreferredPackageVersionResponse = { packagePreference: null };

void multipleRawPrepareCommands;
void multiplePrepareCommands;
void ledgerClient.interactiveSubmissionGetPreferredPackageVersion(
  preferredPackageVersionRequest,
  preferredPackageVersionOptions
);
void ledgerClient.interactiveSubmissionGetPreferredPackages(preferredPackagesRequest, preferredPackagesOptions);
void preferredPackagesRequest;
void preferredPackageVersionRequest;
void preferredPackagesResponse;
void absentPreferredPackage;
void wireNullPreferredPackage;

// @ts-expect-error Every derived traffic-cost estimate includes its server estimation timestamp.
const trafficEstimateWithoutTimestamp: TrafficCostEstimate = {
  requestCost: 100,
  responseCost: 25,
  totalCost: 125,
  totalCostWithOverhead: 5_245,
  costInCents: 1,
  costInDollars: 0.01,
};

void emptyPartySignatures;
void partyWithoutSignatures;
void emptyRawPartySignatureGroups;
void emptyRawSignatures;
void emptyRawPrepareCommands;
void emptyRawActAs;
void emptyPrepareCommands;
void emptyActAsParties;
void trafficEstimateWithoutTimestamp;
void invalidExecuteExactBodyOptions;
void invalidExecuteAndWaitExactBodyOptions;
void invalidExecuteAndWaitForTransactionExactBodyOptions;
