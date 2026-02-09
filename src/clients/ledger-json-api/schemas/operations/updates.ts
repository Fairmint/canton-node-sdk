import { z } from 'zod';
import { NonEmptyStringSchema } from './base';

// Filter content schemas matching AsyncAPI spec
const InterfaceFilterContentSchema = z.object({
  interfaceId: z.string(),
  includeInterfaceView: z.boolean(),
  includeCreatedEventBlob: z.boolean(),
});

const TemplateFilterContentSchema = z.object({
  templateId: z.string(),
  includeCreatedEventBlob: z.boolean(),
});

const WildcardFilterContentSchema = z.object({
  includeCreatedEventBlob: z.boolean(),
});

// Identifier filter schema - matches AsyncAPI spec with 'value' wrapper
export const IdentifierFilterSchema = z.union([
  z.object({ Empty: z.object({}) }),
  z.object({
    InterfaceFilter: z.object({
      value: InterfaceFilterContentSchema,
    }),
  }),
  z.object({
    TemplateFilter: z.object({
      value: TemplateFilterContentSchema,
    }),
  }),
  z.object({
    WildcardFilter: z.object({
      value: WildcardFilterContentSchema,
    }),
  }),
]);

export type IdentifierFilter = z.infer<typeof IdentifierFilterSchema>;

/** Schema for cumulative filter configuration. Defines filters that accumulate across multiple operations. */
export const CumulativeFilterSchema = z.object({
  identifierFilter: IdentifierFilterSchema,
});

export type CumulativeFilter = z.infer<typeof CumulativeFilterSchema>;

/**
 * Schema for filters that apply to any party. Defines cumulative filters that can be applied regardless of specific
 * party.
 */
export const FiltersForAnyPartySchema = z
  .object({
    cumulative: z.array(CumulativeFilterSchema),
  })
  .optional();

export type FiltersForAnyParty = z.infer<typeof FiltersForAnyPartySchema>;

/**
 * Schema for event format configuration in operations. Defines how events are filtered and formatted in request
 * parameters.
 */
export const OperationEventFormatSchema = z.object({
  filtersByParty: z.record(
    z.string(),
    z.object({
      cumulative: z.array(CumulativeFilterSchema),
    })
  ),
  filtersForAnyParty: FiltersForAnyPartySchema,
  verbose: z.boolean().optional(),
});

export type OperationEventFormat = z.infer<typeof OperationEventFormatSchema>;

/** Schema for transaction shape configuration. Defines the level of detail provided in transaction responses. */
export const TransactionShapeSchema = z.union([
  /**
   * AcsDelta: The transaction shape that is sufficient to maintain an accurate ACS view. This translates to create and
   * archive events. The field witness_parties in events are populated as stakeholders, transaction filter will apply
   * accordingly.
   */
  z.literal('TRANSACTION_SHAPE_ACS_DELTA'),
  /**
   * LedgerEffects: The transaction shape that allows maintaining an ACS and also conveys detailed information about all
   * exercises. This translates to create, consuming exercise and non-consuming exercise. The field witness_parties in
   * events are populated as cumulative informees, transaction filter will apply accordingly.
   */
  z.literal('TRANSACTION_SHAPE_LEDGER_EFFECTS'),
]);

export type TransactionShape = z.infer<typeof TransactionShapeSchema>;

/** Schema for transaction format configuration. Defines the event format and transaction shape for ledger operations. */
export const TransactionFormatSchema = z.object({
  eventFormat: OperationEventFormatSchema,
  transactionShape: TransactionShapeSchema,
});

export type TransactionFormat = z.infer<typeof TransactionFormatSchema>;

export const GetTransactionTreeByOffsetParamsSchema = z.object({
  /** Offset in the ledger to fetch the transaction tree from. */
  offset: NonEmptyStringSchema,
  /** Parties to include in the query (optional). */
  parties: z.array(z.string()).optional(),
});

export type GetTransactionTreeByOffsetParams = z.infer<typeof GetTransactionTreeByOffsetParamsSchema>;

/** Shared update format schema for selecting which update types to include. */
export const UpdateFormatSchema = z.object({
  includeTransactions: TransactionFormatSchema.optional(),
  includeReassignments: OperationEventFormatSchema.optional(),
  includeTopologyEvents: z
    .object({
      includeParticipantAuthorizationEvents: z
        .object({
          parties: z.array(z.string()).optional(),
        })
        .optional(),
    })
    .optional(),
});

export type UpdateFormat = z.infer<typeof UpdateFormatSchema>;

/** Parameters for retrieving updates from the ledger. */
export const GetUpdatesParamsSchema = z.object({
  /** Beginning of the requested ledger section (non-negative integer). */
  beginExclusive: z.number(),
  /** End of the requested ledger section. */
  endInclusive: z.number().optional(),
  /** Maximum number of elements to return. */
  limit: z.number().optional(),
  /** Timeout to complete and send result if no new elements are received. */
  streamIdleTimeoutMs: z.number().optional(),
  /** Update format for the request. */
  updateFormat: UpdateFormatSchema,
});

/** Same as GetUpdatesParams but for tree structures. */
export const GetUpdateTreesParamsSchema = GetUpdatesParamsSchema;

/** Parameters for retrieving a specific transaction by its offset. */
export const GetTransactionByOffsetParamsSchema = z.object({
  /** Offset of the transaction being looked up. */
  offset: z.number(),
  /** Transaction format for the request. */
  transactionFormat: TransactionFormatSchema,
});

/** Parameters for retrieving a specific update by its offset. */
export const GetUpdateByOffsetParamsSchema = z.object({
  /** Offset of the update being looked up. */
  offset: z.number(),
  /** Update format for the request. */
  updateFormat: UpdateFormatSchema,
});

/** Schema for get transaction by id parameters. Defines parameters for retrieving a specific transaction by its ID. */
export const GetTransactionByIdParamsSchema = z.object({
  /** ID of the transaction to fetch. */
  updateId: z.string(),
  /** Transaction format for the request. */
  transactionFormat: TransactionFormatSchema,
});

/** Schema for get update by id parameters. Defines parameters for retrieving a specific update by its ID. */
export const GetUpdateByIdParamsSchema = z.object({
  /** ID of the update to fetch. */
  updateId: z.string(),
  /** Parties requesting the update (optional). */
  requestingParties: z.array(z.string()).optional(),
});

/** Schema for get transaction tree by id parameters. Defines parameters for retrieving a transaction tree by its ID. */
export const GetTransactionTreeByIdParamsSchema = z.object({
  /** Update ID to fetch the transaction tree for. */
  updateId: NonEmptyStringSchema,
  /** Parties to include in the query (optional). */
  parties: z.array(z.string()).optional(),
});

// Export types
export type GetUpdatesParams = z.infer<typeof GetUpdatesParamsSchema>;
export type GetUpdateTreesParams = z.infer<typeof GetUpdateTreesParamsSchema>;
export type GetTransactionByOffsetParams = z.infer<typeof GetTransactionByOffsetParamsSchema>;
export type GetUpdateByOffsetParams = z.infer<typeof GetUpdateByOffsetParamsSchema>;
export type GetTransactionByIdParams = z.infer<typeof GetTransactionByIdParamsSchema>;
export type GetUpdateByIdParams = z.infer<typeof GetUpdateByIdParamsSchema>;
export type GetTransactionTreeByIdParams = z.infer<typeof GetTransactionTreeByIdParamsSchema>;
