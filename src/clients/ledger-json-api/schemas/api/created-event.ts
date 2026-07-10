import { z } from 'zod';
import { createRequestSchema } from '../../../../core';
import type { components } from '../../../../generated/canton/community/ledger/ledger-json-api/src/test/resources/json-api-docs/openapi';
import {
  LedgerBase64BytesSchema,
  LedgerJsonValueSchema,
  LedgerNullableOptionalJsonValueSchema,
  LedgerRfc3339TimestampSchema,
  ledgerNullableOptionalResponseField,
  type LedgerJsonValue,
  type LedgerNonNullJsonValue,
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
export type LedgerInterfaceView = Omit<LedgerSchemas['JsInterfaceView'], 'viewStatus' | 'viewValue'> & {
  viewStatus: LedgerStatus;
  viewValue?: LedgerJsonValue;
};

/**
 * Strict CreatedEvent shape shared by Ledger endpoints.
 *
 * The generated OpenAPI leaves Daml values as `unknown`; this type keeps them as lossless JSON and models a wire-null
 * contract key as an absent optional property.
 */
export type LedgerCreatedEvent = Omit<
  LedgerSchemas['CreatedEvent'],
  'contractKey' | 'createArgument' | 'interfaceViews'
> & {
  contractKey?: LedgerNonNullJsonValue;
  createArgument: LedgerJsonValue;
  interfaceViews?: LedgerInterfaceView[];
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
  interfaceId: z.string().min(1),
  viewStatus: LedgerStatusSchema,
  viewValue: LedgerJsonValueSchema.optional(),
  implementationPackageId: ledgerNullableOptionalResponseField(z.string().min(1)),
});

/** Strict, reusable response schema for the pinned Ledger OpenAPI `CreatedEvent`. */
export const LedgerCreatedEventSchema = createRequestSchema<LedgerCreatedEvent>()({
  offset: PositiveInt64Schema,
  nodeId: NonNegativeInt32Schema,
  contractId: z.string().min(1),
  templateId: z.string().min(1),
  contractKey: LedgerNullableOptionalJsonValueSchema,
  contractKeyHash: LedgerBase64BytesSchema.optional(),
  createArgument: LedgerJsonValueSchema,
  createdEventBlob: LedgerBase64BytesSchema.optional(),
  interfaceViews: z.array(LedgerInterfaceViewSchema).optional(),
  witnessParties: z.array(z.string().min(1)).min(1),
  signatories: z.array(z.string().min(1)).min(1),
  observers: z.array(z.string().min(1)).optional(),
  createdAt: LedgerRfc3339TimestampSchema,
  packageName: z.string().min(1),
  representativePackageId: z.string().min(1),
  acsDelta: z.boolean(),
});
