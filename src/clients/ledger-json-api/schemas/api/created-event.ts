import { z } from 'zod';
import {
  createRequestSchema,
  type ContractId,
  type InterfaceId,
  type PackageId,
  type PackageName,
  type PartyId,
  type TemplateId,
} from '../../../../core';
import type { components } from '../../../../generated/canton/community/ledger/ledger-json-api/src/test/resources/json-api-docs/openapi';
import {
  LedgerBase64BytesSchema,
  LedgerContractIdSchema,
  LedgerInterfaceIdSchema,
  LedgerJsonValueSchema,
  LedgerPackageIdSchema,
  LedgerPackageNameSchema,
  LedgerPartyIdSchema,
  LedgerRfc3339TimestampSchema,
  LedgerTemplateIdSchema,
  ledgerNullableOptionalResponseField,
  type LedgerJsonValue,
} from '../wire';

type LedgerSchemas = components['schemas'];

/** Canton protobuf `Any` with its decoded payload represented as lossless JSON. */
export type LedgerProtoAny = Omit<LedgerSchemas['ProtoAny'], 'valueDecoded'> & {
  valueDecoded?: LedgerJsonValue;
};

/** Exact Ledger status shape used by interface views. */
export type LedgerStatus = Omit<LedgerSchemas['JsStatus'], 'details'> & {
  details?: LedgerProtoAny[];
};

/** Exact Ledger interface view with lossless Daml JSON values. */
export type LedgerInterfaceView = Omit<
  LedgerSchemas['JsInterfaceView'],
  'implementationPackageId' | 'interfaceId' | 'viewStatus' | 'viewValue'
> & {
  interfaceId: InterfaceId;
  viewStatus: LedgerStatus;
  viewValue?: LedgerJsonValue;
  implementationPackageId?: PackageId;
};

/**
 * Strict CreatedEvent shape shared by Ledger endpoints.
 *
 * The generated OpenAPI leaves Daml values as `unknown`; this type keeps them as lossless JSON. A top-level-null key is
 * preserved when `contractKeyHash` proves the key is present, while an un-hashed wire null is exposed as omission.
 */
export type LedgerCreatedEvent = Omit<
  LedgerSchemas['CreatedEvent'],
  | 'contractId'
  | 'contractKey'
  | 'createArgument'
  | 'interfaceViews'
  | 'observers'
  | 'packageName'
  | 'representativePackageId'
  | 'signatories'
  | 'templateId'
  | 'witnessParties'
> & {
  contractId: ContractId;
  templateId: TemplateId;
  contractKey?: LedgerJsonValue;
  createArgument: LedgerJsonValue;
  interfaceViews?: LedgerInterfaceView[];
  witnessParties: PartyId[];
  signatories: PartyId[];
  observers?: PartyId[];
  packageName: PackageName;
  representativePackageId: PackageId;
};

const INT32_MIN = -2_147_483_648;
const INT32_MAX = 2_147_483_647;
const Int32Schema = z.number().int().min(INT32_MIN).max(INT32_MAX);
const NonNegativeInt32Schema = z.number().int().min(0).max(INT32_MAX);
const Int64Schema = z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER);
const PositiveInt64Schema = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);

const UnknownFieldSchema = createRequestSchema<LedgerSchemas['Field']>()({
  varint: z.array(Int64Schema).optional(),
  fixed64: z.array(Int64Schema).optional(),
  fixed32: z.array(Int32Schema).optional(),
  lengthDelimited: z.array(LedgerBase64BytesSchema).optional(),
});

/** Exact protobuf unknown-field set carried by Ledger responses. */
export const LedgerUnknownFieldSetSchema = createRequestSchema<LedgerSchemas['UnknownFieldSet']>()({
  fields: z.record(z.string(), UnknownFieldSchema),
});

/** Exact protobuf `Any` response schema with canonical bytes and lossless decoded JSON. */
export const LedgerProtoAnySchema = createRequestSchema<LedgerProtoAny>()({
  typeUrl: z.string(),
  value: LedgerBase64BytesSchema,
  unknownFields: LedgerUnknownFieldSetSchema,
  valueDecoded: LedgerJsonValueSchema.optional(),
});

/** Exact Ledger status response schema. */
export const LedgerStatusSchema = createRequestSchema<LedgerStatus>()({
  code: Int32Schema,
  message: z.string(),
  details: z.array(LedgerProtoAnySchema).optional(),
});

/** Exact Ledger interface-view response schema. */
export const LedgerInterfaceViewSchema = createRequestSchema<LedgerInterfaceView>()({
  interfaceId: LedgerInterfaceIdSchema,
  viewStatus: LedgerStatusSchema,
  viewValue: LedgerJsonValueSchema.optional(),
  implementationPackageId: ledgerNullableOptionalResponseField(LedgerPackageIdSchema),
});

/** Empty for contracts without a key; otherwise the canonical Base64 encoding of a 32-byte Daml contract-key hash. */
export const LedgerContractKeyHashSchema = z.union([
  z.literal(''),
  LedgerBase64BytesSchema.refine((value) => Buffer.from(value, 'base64').length === 32, {
    message: 'Expected a 32-byte contract-key hash',
  }),
]);

const StrictLedgerCreatedEventSchema = createRequestSchema<LedgerCreatedEvent>()({
  offset: PositiveInt64Schema,
  nodeId: NonNegativeInt32Schema,
  contractId: LedgerContractIdSchema,
  templateId: LedgerTemplateIdSchema,
  contractKey: LedgerJsonValueSchema.nullish(),
  contractKeyHash: LedgerContractKeyHashSchema.optional(),
  createArgument: LedgerJsonValueSchema,
  createdEventBlob: LedgerBase64BytesSchema.optional(),
  interfaceViews: z.array(LedgerInterfaceViewSchema).optional(),
  witnessParties: z.array(LedgerPartyIdSchema).min(1),
  signatories: z.array(LedgerPartyIdSchema).min(1),
  observers: z.array(LedgerPartyIdSchema).optional(),
  createdAt: LedgerRfc3339TimestampSchema,
  packageName: LedgerPackageNameSchema,
  representativePackageId: LedgerPackageIdSchema,
  acsDelta: z.boolean(),
});

/**
 * Strict, reusable response schema for the pinned Ledger OpenAPI `CreatedEvent`.
 *
 * The JSON codec represents both an absent contract key and a present Daml `Optional None` key as wire `null`.
 * `contractKeyHash` disambiguates them: a non-empty hash means the null is the actual key value.
 */
export const LedgerCreatedEventSchema = StrictLedgerCreatedEventSchema.superRefine((event, context) => {
  const hasContractKeyHash = (event.contractKeyHash?.length ?? 0) > 0;
  if (event.contractKey !== undefined && event.contractKey !== null && !hasContractKeyHash) {
    context.addIssue({
      code: 'custom',
      message: 'A present contract key requires a non-empty contractKeyHash',
      path: ['contractKeyHash'],
    });
  }
}).transform(normalizeContractKeyPresence);

function normalizeContractKeyPresence(event: LedgerCreatedEvent): LedgerCreatedEvent {
  const hasContractKeyHash = (event.contractKeyHash?.length ?? 0) > 0;
  if (hasContractKeyHash) {
    return event.contractKey === undefined ? { ...event, contractKey: null } : event;
  }

  if (event.contractKey === undefined || event.contractKey === null) {
    const normalized = { ...event };
    delete normalized.contractKey;
    return normalized;
  }

  return event;
}
