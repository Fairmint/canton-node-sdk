import { z } from 'zod';
import { createRequestSchema, type Brand } from '../../../../core';
import type {
  components,
  paths,
} from '../../../../generated/canton/community/ledger/ledger-json-api/src/test/resources/json-api-docs/openapi';
import {
  LedgerJsonValueSchema,
  LedgerNameSchema,
  LedgerNonEmptyBase64BytesSchema,
  LedgerRfc3339TimestampSchema,
  LedgerStringSchema,
  ledgerNullableOptionalResponseField,
  type LedgerJsonValue,
  type LedgerNonNullJsonValue,
} from '../wire';
import {
  LedgerCreatedEventSchema,
  LedgerUnknownFieldSetSchema,
  type LedgerCreatedEvent,
  type LedgerProtoAny,
} from './created-event';

type LedgerSchemas = components['schemas'];
type PrepareEndpoint = '/v2/interactive-submission/prepare';
type ExecuteEndpoint = '/v2/interactive-submission/execute';
type ExecuteAndWaitEndpoint = '/v2/interactive-submission/executeAndWait';
type ExecuteAndWaitForTransactionEndpoint = '/v2/interactive-submission/executeAndWaitForTransaction';

type GeneratedInteractiveSubmissionPrepareRequest =
  paths[PrepareEndpoint]['post']['requestBody']['content']['application/json'];
type GeneratedInteractiveSubmissionPrepareResponse =
  paths[PrepareEndpoint]['post']['responses']['200']['content']['application/json'];
type GeneratedInteractiveSubmissionExecuteRequest =
  paths[ExecuteEndpoint]['post']['requestBody']['content']['application/json'];
export type InteractiveSubmissionExecuteResponse =
  paths[ExecuteEndpoint]['post']['responses']['200']['content']['application/json'];
type GeneratedInteractiveSubmissionExecuteAndWaitRequest =
  paths[ExecuteAndWaitEndpoint]['post']['requestBody']['content']['application/json'];
export type InteractiveSubmissionExecuteAndWaitResponse =
  paths[ExecuteAndWaitEndpoint]['post']['responses']['200']['content']['application/json'];
type GeneratedInteractiveSubmissionExecuteAndWaitForTransactionRequest =
  paths[ExecuteAndWaitForTransactionEndpoint]['post']['requestBody']['content']['application/json'];
type GeneratedInteractiveSubmissionExecuteAndWaitForTransactionResponse =
  paths[ExecuteAndWaitForTransactionEndpoint]['post']['responses']['200']['content']['application/json'];

/** Any losslessly representable JSON value. */
export type InteractiveSubmissionJsonValue = LedgerJsonValue;

/** A present Daml JSON value; nested JSON nulls remain valid. */
export type InteractiveSubmissionNonNullJsonValue = LedgerNonNullJsonValue;

/** A mutable non-empty array matching raw Ledger request shapes. */
export type InteractiveSubmissionNonEmptyArray<Value> = [Value, ...Value[]];

type UnionKeys<Union> = Union extends Union ? keyof Union : never;
type ExactOneOfHelper<Variant, Union> = Variant extends Union
  ? Variant & Partial<Record<Exclude<UnionKeys<Union>, keyof Variant>, never>>
  : never;
type ExactOneOf<Union> = ExactOneOfHelper<Union, Union>;

type InteractiveSubmissionCreateCommand = Omit<LedgerSchemas['CreateCommand'], 'createArguments'> & {
  createArguments: InteractiveSubmissionJsonValue;
};

type InteractiveSubmissionExerciseCommand = Omit<LedgerSchemas['ExerciseCommand'], 'choiceArgument'> & {
  choiceArgument: InteractiveSubmissionJsonValue;
};

type InteractiveSubmissionCreateAndExerciseCommand = Omit<
  LedgerSchemas['CreateAndExerciseCommand'],
  'createArguments' | 'choiceArgument'
> & {
  createArguments: InteractiveSubmissionJsonValue;
  choiceArgument: InteractiveSubmissionJsonValue;
};

type InteractiveSubmissionExerciseByKeyCommand = Omit<
  LedgerSchemas['ExerciseByKeyCommand'],
  'choiceArgument' | 'contractKey'
> & {
  contractKey: InteractiveSubmissionJsonValue;
  choiceArgument: InteractiveSubmissionJsonValue;
};

type InteractiveSubmissionCommandVariants =
  | { CreateAndExerciseCommand: InteractiveSubmissionCreateAndExerciseCommand }
  | { CreateCommand: InteractiveSubmissionCreateCommand }
  | { ExerciseByKeyCommand: InteractiveSubmissionExerciseByKeyCommand }
  | { ExerciseCommand: InteractiveSubmissionExerciseCommand };
export type InteractiveSubmissionCommand = ExactOneOf<InteractiveSubmissionCommandVariants>;

type InteractiveSubmissionDeduplicationPeriodVariants = LedgerSchemas['DeduplicationPeriod2'];
type InteractiveSubmissionDeduplicationPeriod = ExactOneOf<InteractiveSubmissionDeduplicationPeriodVariants>;
type InteractiveSubmissionTimeVariants = LedgerSchemas['Time'];
type InteractiveSubmissionTime = ExactOneOf<InteractiveSubmissionTimeVariants>;
type InteractiveSubmissionMinLedgerTime = Omit<LedgerSchemas['MinLedgerTime'], 'time'> & {
  time?: InteractiveSubmissionTime;
};

type InteractiveSubmissionIdentifierFilterVariants = LedgerSchemas['IdentifierFilter'];
export type InteractiveSubmissionIdentifierFilter = ExactOneOf<InteractiveSubmissionIdentifierFilterVariants>;
type InteractiveSubmissionCumulativeFilter = Omit<LedgerSchemas['CumulativeFilter'], 'identifierFilter'> & {
  identifierFilter?: InteractiveSubmissionIdentifierFilter;
};
type InteractiveSubmissionFilters = Omit<LedgerSchemas['Filters'], 'cumulative'> & {
  cumulative?: InteractiveSubmissionCumulativeFilter[];
};
type InteractiveSubmissionEventFormat = Omit<LedgerSchemas['EventFormat'], 'filtersByParty' | 'filtersForAnyParty'> & {
  filtersByParty?: Record<string, InteractiveSubmissionFilters>;
  filtersForAnyParty?: InteractiveSubmissionFilters;
};
type InteractiveSubmissionTransactionFormat = Omit<
  LedgerSchemas['TransactionFormat'],
  'eventFormat' | 'transactionShape'
> & {
  eventFormat: InteractiveSubmissionEventFormat;
  transactionShape: 'TRANSACTION_SHAPE_ACS_DELTA' | 'TRANSACTION_SHAPE_LEDGER_EFFECTS';
};

export type InteractiveSubmissionPrefetchContractKey = Omit<LedgerSchemas['PrefetchContractKey'], 'contractKey'> & {
  contractKey: InteractiveSubmissionJsonValue;
};

export type InteractiveSubmissionPrepareRequest = Omit<
  GeneratedInteractiveSubmissionPrepareRequest,
  'actAs' | 'commands' | 'estimateTrafficCost' | 'hashingSchemeVersion' | 'minLedgerTime' | 'prefetchContractKeys'
> & {
  /** Pinned Canton 0.6.8 supports exactly one command per interactive preparation. */
  commands: [InteractiveSubmissionCommand];
  actAs: InteractiveSubmissionNonEmptyArray<string>;
  estimateTrafficCost?: InteractiveSubmissionCostEstimationHints;
  hashingSchemeVersion?: InteractiveSubmissionHashingSchemeVersion;
  minLedgerTime?: InteractiveSubmissionMinLedgerTime;
  prefetchContractKeys?: InteractiveSubmissionPrefetchContractKey[];
};

/** Signature formats defined by the pinned Canton Ledger API crypto protobuf. */
export type InteractiveSubmissionSignatureFormat =
  | 'SIGNATURE_FORMAT_RAW'
  | 'SIGNATURE_FORMAT_DER'
  | 'SIGNATURE_FORMAT_CONCAT'
  | 'SIGNATURE_FORMAT_SYMBOLIC';

/** Signing algorithms defined by the pinned Canton Ledger API crypto protobuf. */
export type InteractiveSubmissionSigningAlgorithmSpec =
  | 'SIGNING_ALGORITHM_SPEC_ED25519'
  | 'SIGNING_ALGORITHM_SPEC_EC_DSA_SHA_256'
  | 'SIGNING_ALGORITHM_SPEC_EC_DSA_SHA_384';

type InteractiveSubmissionCostEstimationHints = Omit<LedgerSchemas['CostEstimationHints'], 'expectedSignatures'> & {
  expectedSignatures?: InteractiveSubmissionSigningAlgorithmSpec[];
};

export type InteractiveSubmissionHashingSchemeVersion = Exclude<
  GeneratedInteractiveSubmissionExecuteRequest['hashingSchemeVersion'],
  'HASHING_SCHEME_VERSION_UNSPECIFIED'
>;

export type InteractiveSubmissionPrepareResponse = Omit<
  GeneratedInteractiveSubmissionPrepareResponse,
  'hashingSchemeVersion'
> & {
  hashingSchemeVersion: InteractiveSubmissionHashingSchemeVersion;
};

export type InteractiveSubmissionSignature = Omit<LedgerSchemas['Signature'], 'format' | 'signingAlgorithmSpec'> & {
  format: InteractiveSubmissionSignatureFormat;
  signingAlgorithmSpec: InteractiveSubmissionSigningAlgorithmSpec;
};

type InteractiveSubmissionSinglePartySignatures = Omit<LedgerSchemas['SinglePartySignatures'], 'signatures'> & {
  signatures: InteractiveSubmissionNonEmptyArray<InteractiveSubmissionSignature>;
};

type InteractiveSubmissionPartySignatures = Omit<LedgerSchemas['PartySignatures'], 'signatures'> & {
  signatures: InteractiveSubmissionNonEmptyArray<InteractiveSubmissionSinglePartySignatures>;
};

type WithExactInteractiveSubmissionRequest<Request extends { partySignatures: unknown }> = Omit<
  Request,
  'deduplicationPeriod' | 'hashingSchemeVersion' | 'minLedgerTime' | 'partySignatures'
> & {
  deduplicationPeriod?: InteractiveSubmissionDeduplicationPeriod;
  hashingSchemeVersion: InteractiveSubmissionHashingSchemeVersion;
  minLedgerTime?: InteractiveSubmissionMinLedgerTime;
  partySignatures: InteractiveSubmissionPartySignatures;
};

export type InteractiveSubmissionExecuteRequest =
  WithExactInteractiveSubmissionRequest<GeneratedInteractiveSubmissionExecuteRequest>;
export type InteractiveSubmissionExecuteAndWaitRequest =
  WithExactInteractiveSubmissionRequest<GeneratedInteractiveSubmissionExecuteAndWaitRequest>;
export type InteractiveSubmissionExecuteAndWaitForTransactionRequest = Omit<
  WithExactInteractiveSubmissionRequest<GeneratedInteractiveSubmissionExecuteAndWaitForTransactionRequest>,
  'transactionFormat'
> & {
  transactionFormat?: InteractiveSubmissionTransactionFormat;
};

/** Canton protobuf Any details carry decoded JSON, despite the generated OpenAPI declaring a string. */
export type InteractiveSubmissionProtoAny = LedgerProtoAny;

type InteractiveSubmissionCreatedEvent = LedgerCreatedEvent;

type InteractiveSubmissionExercisedEvent = Omit<
  LedgerSchemas['ExercisedEvent'],
  'choiceArgument' | 'exerciseResult'
> & {
  choiceArgument: InteractiveSubmissionJsonValue;
  exerciseResult?: InteractiveSubmissionJsonValue;
};

type GeneratedInteractiveSubmissionEvent = LedgerSchemas['Event'];
type InteractiveSubmissionEventVariants =
  | Extract<GeneratedInteractiveSubmissionEvent, { ArchivedEvent: unknown }>
  | { CreatedEvent: InteractiveSubmissionCreatedEvent }
  | { ExercisedEvent: InteractiveSubmissionExercisedEvent };
export type InteractiveSubmissionEvent = ExactOneOf<InteractiveSubmissionEventVariants>;

/** Normalized Ledger trace context; protobuf option nulls are exposed as omitted properties. */
export type InteractiveSubmissionTraceContext = Omit<LedgerSchemas['TraceContext'], 'traceparent' | 'tracestate'> & {
  traceparent?: string;
  tracestate?: string;
};

/** Raw 32-byte Daml-LF SHA-256 transaction hash encoded as 64 lowercase hex characters. */
export type InteractiveSubmissionExternalTransactionHashHex = Brand<
  string,
  'InteractiveSubmissionExternalTransactionHashHex'
>;

export type InteractiveSubmissionTransaction = Omit<
  LedgerSchemas['JsTransaction'],
  'events' | 'externalTransactionHash' | 'traceContext'
> & {
  events: InteractiveSubmissionEvent[];
  traceContext?: InteractiveSubmissionTraceContext;
  externalTransactionHash?: InteractiveSubmissionExternalTransactionHashHex;
};

export type InteractiveSubmissionExecuteAndWaitForTransactionResponse = Omit<
  GeneratedInteractiveSubmissionExecuteAndWaitForTransactionResponse,
  'transaction'
> & {
  transaction: InteractiveSubmissionTransaction;
};

const INT32_MAX = 2_147_483_647;
const DURATION_SECONDS_MIN = -315_576_000_000;
const DURATION_SECONDS_MAX = 315_576_000_000;
const DURATION_NANOS_MIN = -999_999_999;
const DURATION_NANOS_MAX = 999_999_999;

const NonNegativeInt32Schema = z.number().int().min(0).max(INT32_MAX);
const PositiveInt32Schema = z.number().int().min(1).max(INT32_MAX);
const NonNegativeInt64Schema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const PositiveInt64Schema = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);

const RequiredJsonValueSchema = LedgerJsonValueSchema;
const nullableOptionalResponseField = ledgerNullableOptionalResponseField;

const EmptyObjectSchema: z.ZodType<Record<string, never>> = z.record(z.string(), z.never());

const HashingSchemeVersionSchema = z.enum(['HASHING_SCHEME_VERSION_V2', 'HASHING_SCHEME_VERSION_V3']);

const SignatureFormatSchema = z.enum([
  'SIGNATURE_FORMAT_RAW',
  'SIGNATURE_FORMAT_DER',
  'SIGNATURE_FORMAT_CONCAT',
  'SIGNATURE_FORMAT_SYMBOLIC',
]);

const SigningAlgorithmSpecSchema = z.enum([
  'SIGNING_ALGORITHM_SPEC_ED25519',
  'SIGNING_ALGORITHM_SPEC_EC_DSA_SHA_256',
  'SIGNING_ALGORITHM_SPEC_EC_DSA_SHA_384',
]);

const UnknownFieldSetSchema = LedgerUnknownFieldSetSchema;

const DurationSchema = createRequestSchema<LedgerSchemas['Duration']>()({
  seconds: z.number().int().min(DURATION_SECONDS_MIN).max(DURATION_SECONDS_MAX),
  nanos: z.number().int().min(DURATION_NANOS_MIN).max(DURATION_NANOS_MAX),
  unknownFields: UnknownFieldSetSchema.optional(),
}).superRefine((duration, context) => {
  if ((duration.seconds > 0 && duration.nanos < 0) || (duration.seconds < 0 && duration.nanos > 0)) {
    context.addIssue({
      code: 'custom',
      path: ['nanos'],
      message: 'Duration seconds and nanos must have the same sign unless seconds is zero',
    });
  }
});

const DeduplicationDurationSchema = createRequestSchema<LedgerSchemas['DeduplicationDuration2']>()({
  value: DurationSchema.refine((duration) => duration.seconds > 0 || (duration.seconds === 0 && duration.nanos >= 0), {
    message: 'Deduplication duration must be non-negative',
  }),
});

const DeduplicationOffsetSchema = createRequestSchema<LedgerSchemas['DeduplicationOffset2']>()({
  value: NonNegativeInt64Schema,
});

const DeduplicationPeriodSchema: z.ZodType<InteractiveSubmissionDeduplicationPeriod> = z.union([
  createRequestSchema<Extract<InteractiveSubmissionDeduplicationPeriodVariants, { DeduplicationDuration: unknown }>>()({
    DeduplicationDuration: DeduplicationDurationSchema,
  }),
  createRequestSchema<Extract<InteractiveSubmissionDeduplicationPeriodVariants, { DeduplicationOffset: unknown }>>()({
    DeduplicationOffset: DeduplicationOffsetSchema,
  }),
  createRequestSchema<Extract<InteractiveSubmissionDeduplicationPeriodVariants, { Empty: unknown }>>()({
    Empty: EmptyObjectSchema,
  }),
]);

const MinLedgerTimeAbsoluteSchema = createRequestSchema<LedgerSchemas['MinLedgerTimeAbs']>()({
  value: LedgerRfc3339TimestampSchema,
});

const MinLedgerTimeRelativeSchema = createRequestSchema<LedgerSchemas['MinLedgerTimeRel']>()({
  value: DurationSchema,
});

const LedgerTimeSchema: z.ZodType<InteractiveSubmissionTime> = z.union([
  createRequestSchema<Extract<InteractiveSubmissionTimeVariants, { Empty: unknown }>>()({
    Empty: EmptyObjectSchema,
  }),
  createRequestSchema<Extract<InteractiveSubmissionTimeVariants, { MinLedgerTimeAbs: unknown }>>()({
    MinLedgerTimeAbs: MinLedgerTimeAbsoluteSchema,
  }),
  createRequestSchema<Extract<InteractiveSubmissionTimeVariants, { MinLedgerTimeRel: unknown }>>()({
    MinLedgerTimeRel: MinLedgerTimeRelativeSchema,
  }),
]);

const MinLedgerTimeSchema = createRequestSchema<InteractiveSubmissionMinLedgerTime>()({
  time: LedgerTimeSchema.optional(),
});

const CreateCommandContentSchema = createRequestSchema<InteractiveSubmissionCreateCommand>()({
  templateId: z.string().min(1),
  createArguments: RequiredJsonValueSchema,
});

const ExerciseCommandContentSchema = createRequestSchema<InteractiveSubmissionExerciseCommand>()({
  templateId: z.string().min(1),
  contractId: z.string().min(1),
  choice: LedgerNameSchema,
  choiceArgument: RequiredJsonValueSchema,
});

const CreateAndExerciseCommandContentSchema = createRequestSchema<InteractiveSubmissionCreateAndExerciseCommand>()({
  templateId: z.string().min(1),
  createArguments: RequiredJsonValueSchema,
  choice: LedgerNameSchema,
  choiceArgument: RequiredJsonValueSchema,
});

const ExerciseByKeyCommandContentSchema = createRequestSchema<InteractiveSubmissionExerciseByKeyCommand>()({
  templateId: z.string().min(1),
  contractKey: RequiredJsonValueSchema,
  choice: LedgerNameSchema,
  choiceArgument: RequiredJsonValueSchema,
});

const CommandSchema: z.ZodType<InteractiveSubmissionCommand> = z.union([
  createRequestSchema<Extract<InteractiveSubmissionCommandVariants, { CreateAndExerciseCommand: unknown }>>()({
    CreateAndExerciseCommand: CreateAndExerciseCommandContentSchema,
  }),
  createRequestSchema<Extract<InteractiveSubmissionCommandVariants, { CreateCommand: unknown }>>()({
    CreateCommand: CreateCommandContentSchema,
  }),
  createRequestSchema<Extract<InteractiveSubmissionCommandVariants, { ExerciseByKeyCommand: unknown }>>()({
    ExerciseByKeyCommand: ExerciseByKeyCommandContentSchema,
  }),
  createRequestSchema<Extract<InteractiveSubmissionCommandVariants, { ExerciseCommand: unknown }>>()({
    ExerciseCommand: ExerciseCommandContentSchema,
  }),
]);

const SingleCommandSchema = z
  .array(CommandSchema)
  .length(1)
  .transform((commands): [InteractiveSubmissionCommand] => commands as [InteractiveSubmissionCommand]);

const NonEmptyActAsSchema = z
  .array(z.string().min(1))
  .min(1)
  .transform(
    (parties): InteractiveSubmissionNonEmptyArray<string> => parties as InteractiveSubmissionNonEmptyArray<string>
  );

const DisclosedContractSchema = createRequestSchema<LedgerSchemas['DisclosedContract']>()({
  templateId: z.string().min(1).optional(),
  contractId: z.string().min(1).optional(),
  createdEventBlob: LedgerNonEmptyBase64BytesSchema,
  synchronizerId: z.string().min(1).optional(),
});

const PrefetchContractKeySchema = createRequestSchema<InteractiveSubmissionPrefetchContractKey>()({
  templateId: z.string().min(1),
  contractKey: RequiredJsonValueSchema,
  limit: PositiveInt32Schema.optional(),
});

const CostEstimationHintsSchema = createRequestSchema<InteractiveSubmissionCostEstimationHints>()({
  disabled: z.boolean().optional(),
  expectedSignatures: z.array(SigningAlgorithmSpecSchema).optional(),
});

/** Exact interactive-submission prepare request from the pinned Ledger OpenAPI. */
export const InteractiveSubmissionPrepareRequestSchema = createRequestSchema<InteractiveSubmissionPrepareRequest>()({
  userId: z.string().optional(),
  commandId: LedgerStringSchema,
  commands: SingleCommandSchema,
  minLedgerTime: MinLedgerTimeSchema.optional(),
  actAs: NonEmptyActAsSchema,
  readAs: z.array(z.string().min(1)).optional(),
  disclosedContracts: z.array(DisclosedContractSchema).optional(),
  synchronizerId: z.string().min(1).optional(),
  packageIdSelectionPreference: z.array(z.string().min(1)).optional(),
  verboseHashing: z.boolean().optional(),
  prefetchContractKeys: z.array(PrefetchContractKeySchema).optional(),
  maxRecordTime: LedgerRfc3339TimestampSchema.optional(),
  estimateTrafficCost: CostEstimationHintsSchema.optional(),
  tapsMaxPasses: PositiveInt32Schema.optional(),
  hashingSchemeVersion: HashingSchemeVersionSchema.optional(),
});

/** Traffic cost estimation for a prepared transaction. */
export const CostEstimationSchema = createRequestSchema<LedgerSchemas['CostEstimation']>()({
  estimationTimestamp: LedgerRfc3339TimestampSchema,
  confirmationRequestTrafficCostEstimation: NonNegativeInt64Schema,
  confirmationResponseTrafficCostEstimation: NonNegativeInt64Schema,
  totalTrafficCostEstimation: NonNegativeInt64Schema,
});

/** Exact interactive-submission prepare response from the pinned Ledger OpenAPI. */
export const InteractiveSubmissionPrepareResponseSchema = createRequestSchema<InteractiveSubmissionPrepareResponse>()({
  preparedTransaction: LedgerNonEmptyBase64BytesSchema,
  preparedTransactionHash: LedgerNonEmptyBase64BytesSchema,
  hashingSchemeVersion: HashingSchemeVersionSchema,
  hashingDetails: nullableOptionalResponseField(z.string()),
  costEstimation: nullableOptionalResponseField(CostEstimationSchema),
});

const SignatureSchema = createRequestSchema<InteractiveSubmissionSignature>()({
  format: SignatureFormatSchema,
  signature: LedgerNonEmptyBase64BytesSchema,
  signedBy: z.string().min(1),
  signingAlgorithmSpec: SigningAlgorithmSpecSchema,
});

const NonEmptySignaturesSchema = z
  .array(SignatureSchema)
  .min(1)
  .transform(
    (signatures): InteractiveSubmissionNonEmptyArray<InteractiveSubmissionSignature> =>
      signatures as InteractiveSubmissionNonEmptyArray<InteractiveSubmissionSignature>
  );

const SinglePartySignaturesSchema = createRequestSchema<InteractiveSubmissionSinglePartySignatures>()({
  party: z.string().min(1),
  signatures: NonEmptySignaturesSchema,
});

const NonEmptySinglePartySignaturesSchema = z
  .array(SinglePartySignaturesSchema)
  .min(1)
  .transform(
    (signatures): InteractiveSubmissionNonEmptyArray<InteractiveSubmissionSinglePartySignatures> =>
      signatures as InteractiveSubmissionNonEmptyArray<InteractiveSubmissionSinglePartySignatures>
  );

const PartySignaturesSchema = createRequestSchema<InteractiveSubmissionPartySignatures>()({
  signatures: NonEmptySinglePartySignaturesSchema,
});

const InterfaceFilterContentSchema = createRequestSchema<LedgerSchemas['InterfaceFilter1']>()({
  interfaceId: z.string(),
  includeInterfaceView: z.boolean().optional(),
  includeCreatedEventBlob: z.boolean().optional(),
});

const InterfaceFilterSchema = createRequestSchema<LedgerSchemas['InterfaceFilter']>()({
  value: InterfaceFilterContentSchema,
});

const TemplateFilterContentSchema = createRequestSchema<LedgerSchemas['TemplateFilter1']>()({
  templateId: z.string(),
  includeCreatedEventBlob: z.boolean().optional(),
});

const TemplateFilterSchema = createRequestSchema<LedgerSchemas['TemplateFilter']>()({
  value: TemplateFilterContentSchema,
});

const WildcardFilterContentSchema = createRequestSchema<LedgerSchemas['WildcardFilter1']>()({
  includeCreatedEventBlob: z.boolean().optional(),
});

const WildcardFilterSchema = createRequestSchema<LedgerSchemas['WildcardFilter']>()({
  value: WildcardFilterContentSchema,
});

const IdentifierFilterSchema: z.ZodType<InteractiveSubmissionIdentifierFilter> = z.union([
  createRequestSchema<Extract<InteractiveSubmissionIdentifierFilterVariants, { Empty: unknown }>>()({
    Empty: EmptyObjectSchema,
  }),
  createRequestSchema<Extract<InteractiveSubmissionIdentifierFilterVariants, { InterfaceFilter: unknown }>>()({
    InterfaceFilter: InterfaceFilterSchema,
  }),
  createRequestSchema<Extract<InteractiveSubmissionIdentifierFilterVariants, { TemplateFilter: unknown }>>()({
    TemplateFilter: TemplateFilterSchema,
  }),
  createRequestSchema<Extract<InteractiveSubmissionIdentifierFilterVariants, { WildcardFilter: unknown }>>()({
    WildcardFilter: WildcardFilterSchema,
  }),
]);

const CumulativeFilterSchema = createRequestSchema<InteractiveSubmissionCumulativeFilter>()({
  identifierFilter: IdentifierFilterSchema.optional(),
});

const FiltersSchema = createRequestSchema<InteractiveSubmissionFilters>()({
  cumulative: z.array(CumulativeFilterSchema).optional(),
});

const EventFormatSchema = createRequestSchema<InteractiveSubmissionEventFormat>()({
  filtersByParty: z.record(z.string(), FiltersSchema).optional(),
  filtersForAnyParty: FiltersSchema.optional(),
  verbose: z.boolean().optional(),
});

const TransactionFormatSchema = createRequestSchema<InteractiveSubmissionTransactionFormat>()({
  eventFormat: EventFormatSchema,
  transactionShape: z.enum(['TRANSACTION_SHAPE_ACS_DELTA', 'TRANSACTION_SHAPE_LEDGER_EFFECTS']),
});

const ExecuteRequestShape = {
  preparedTransaction: LedgerNonEmptyBase64BytesSchema,
  partySignatures: PartySignaturesSchema,
  deduplicationPeriod: DeduplicationPeriodSchema.optional(),
  submissionId: LedgerStringSchema,
  userId: z.string().optional(),
  hashingSchemeVersion: HashingSchemeVersionSchema,
  minLedgerTime: MinLedgerTimeSchema.optional(),
} satisfies z.ZodRawShape;

/** Execute a prepared and signed interactive submission. */
export const InteractiveSubmissionExecuteRequestSchema = createRequestSchema<InteractiveSubmissionExecuteRequest>()({
  ...ExecuteRequestShape,
});

/** Execute a prepared submission and wait for its completion. */
export const InteractiveSubmissionExecuteAndWaitRequestSchema =
  createRequestSchema<InteractiveSubmissionExecuteAndWaitRequest>()({
    ...ExecuteRequestShape,
  });

/** Execute a prepared submission and wait for the resulting transaction. */
export const InteractiveSubmissionExecuteAndWaitForTransactionRequestSchema =
  createRequestSchema<InteractiveSubmissionExecuteAndWaitForTransactionRequest>()({
    ...ExecuteRequestShape,
    transactionFormat: TransactionFormatSchema.optional(),
  });

const ArchivedEventSchema = createRequestSchema<LedgerSchemas['ArchivedEvent']>()({
  offset: PositiveInt64Schema,
  nodeId: NonNegativeInt32Schema,
  contractId: z.string(),
  templateId: z.string(),
  witnessParties: z.array(z.string()).min(1),
  packageName: z.string(),
  implementedInterfaces: z.array(z.string()).optional(),
});

const ExercisedEventSchema = createRequestSchema<InteractiveSubmissionExercisedEvent>()({
  offset: PositiveInt64Schema,
  nodeId: NonNegativeInt32Schema,
  contractId: z.string(),
  templateId: z.string(),
  interfaceId: nullableOptionalResponseField(z.string()),
  choice: z.string(),
  choiceArgument: RequiredJsonValueSchema,
  actingParties: z.array(z.string()).min(1),
  consuming: z.boolean(),
  witnessParties: z.array(z.string()).min(1),
  lastDescendantNodeId: NonNegativeInt32Schema,
  exerciseResult: RequiredJsonValueSchema.optional(),
  packageName: z.string(),
  implementedInterfaces: z.array(z.string()).optional(),
  acsDelta: z.boolean(),
});

const EventSchema: z.ZodType<InteractiveSubmissionEvent> = z.union([
  createRequestSchema<Extract<InteractiveSubmissionEventVariants, { ArchivedEvent: unknown }>>()({
    ArchivedEvent: ArchivedEventSchema,
  }),
  createRequestSchema<Extract<InteractiveSubmissionEventVariants, { CreatedEvent: unknown }>>()({
    CreatedEvent: LedgerCreatedEventSchema,
  }),
  createRequestSchema<Extract<InteractiveSubmissionEventVariants, { ExercisedEvent: unknown }>>()({
    ExercisedEvent: ExercisedEventSchema,
  }),
]);

const TraceContextSchema = createRequestSchema<InteractiveSubmissionTraceContext>()({
  traceparent: nullableOptionalResponseField(z.string()),
  tracestate: nullableOptionalResponseField(z.string()),
});

const ExternalTransactionHashHexSchema: z.ZodType<InteractiveSubmissionExternalTransactionHashHex> = z
  .string()
  .regex(/^[0-9a-f]{64}$/, {
    message: 'Expected a canonical lowercase 32-byte Daml-LF transaction hash',
  })
  .transform(
    (value): InteractiveSubmissionExternalTransactionHashHex => value as InteractiveSubmissionExternalTransactionHashHex
  );

const TransactionSchema = createRequestSchema<InteractiveSubmissionTransaction>()({
  updateId: z.string(),
  commandId: z.string().optional(),
  workflowId: z.string().optional(),
  effectiveAt: LedgerRfc3339TimestampSchema,
  events: z.array(EventSchema),
  offset: PositiveInt64Schema,
  synchronizerId: z.string().min(1),
  traceContext: nullableOptionalResponseField(TraceContextSchema),
  recordTime: LedgerRfc3339TimestampSchema,
  externalTransactionHash: nullableOptionalResponseField(ExternalTransactionHashHexSchema),
  paidTrafficCost: nullableOptionalResponseField(NonNegativeInt64Schema),
});

/** Exact response for asynchronous execute. */
export const InteractiveSubmissionExecuteResponseSchema = createRequestSchema<InteractiveSubmissionExecuteResponse>()(
  {}
);

/** Exact response for execute-and-wait. */
export const InteractiveSubmissionExecuteAndWaitResponseSchema =
  createRequestSchema<InteractiveSubmissionExecuteAndWaitResponse>()({
    updateId: z.string(),
    completionOffset: PositiveInt64Schema,
  });

/** Exact response for execute-and-wait-for-transaction. */
export const InteractiveSubmissionExecuteAndWaitForTransactionResponseSchema =
  createRequestSchema<InteractiveSubmissionExecuteAndWaitForTransactionResponse>()({
    transaction: TransactionSchema,
  });

export type CostEstimation = LedgerSchemas['CostEstimation'];
