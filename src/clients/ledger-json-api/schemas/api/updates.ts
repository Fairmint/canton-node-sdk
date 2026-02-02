import { z } from 'zod';
import { TraceContextSchema } from '../common';
import { JsCommandsSchema } from './commands';
import { OffsetCheckpointSchema } from './completions';
import {
  ArchivedEventDetailsSchema,
  AssignedEventDetailsSchema,
  CreatedEventDetailsSchema,
  UnassignedEventDetailsSchema,
} from './event-details';
import {
  ArchivedTreeEventSchema,
  CreatedTreeEventSchema,
  EventFormatSchema,
  ExercisedTreeEventSchema,
  TreeEventSchema,
} from './events';
import { JsReassignmentSchema } from './reassignment';

/** Update event kind (oneOf all update event types). */
export const JsUpdateEventKindSchema = z.union([
  z.object({ JsCreated: CreatedEventDetailsSchema }),
  z.object({ JsArchived: ArchivedEventDetailsSchema }),
  z.object({ JsAssigned: AssignedEventDetailsSchema }),
  z.object({ JsUnassigned: UnassignedEventDetailsSchema }),
]);

/** Update event details. */
export const JsUpdateEventSchema = z.object({
  /** The kind of update event. */
  kind: JsUpdateEventKindSchema,
  /** Synchronizer ID. */
  synchronizerId: z.string(),
  /** Reassignment counter. */
  reassignmentCounter: z.number(),
});

/** Transaction details. */
export const JsTransactionSchema = z.object({
  /** Unique update ID for the transaction. */
  updateId: z.string(),
  /** Command ID associated with the transaction (optional). */
  commandId: z.string().optional(),
  /** Workflow ID associated with the transaction (optional). */
  workflowId: z.string().optional(),
  /** Effective time of the transaction (ISO 8601). */
  effectiveAt: z.string(),
  /** Offset of the transaction in the ledger stream. */
  offset: z.number(),
  /** Collection of update events. */
  events: z.array(JsUpdateEventSchema),
  /** Trace context (optional). */
  traceContext: TraceContextSchema.optional(),
  /** Record time of the transaction. */
  recordTime: z.string(),
});

/** Transaction tree details. */
export const JsTransactionTreeSchema = z.object({
  /** Unique update ID for the transaction. */
  updateId: z.string(),
  /** Command ID associated with the transaction (optional). */
  commandId: z.string().optional(),
  /** Workflow ID associated with the transaction (optional). */
  workflowId: z.string().optional(),
  /** Effective time of the transaction (ISO 8601). */
  effectiveAt: z.string(),
  /** Offset of the transaction in the ledger stream. */
  offset: z.number(),
  /** Map of event node IDs to tree events. */
  eventsById: z.record(z.string(), TreeEventSchema),
  /** Record time of the transaction. */
  recordTime: z.string(),
});

/** Update (oneOf transaction or transaction tree). */
export const JsUpdateSchema = z.union([
  z.object({ JsTransaction: JsTransactionSchema }),
  z.object({ JsTransactionTree: JsTransactionTreeSchema }),
  z.object({ OffsetCheckpoint: OffsetCheckpointSchema }),
]);

/** Topology transaction event schema for WebSocket streams. */
export const WsTopologyTransactionSchema = z.object({
  /** Unique update ID for the topology transaction. */
  updateId: z.string(),
  /** Offset of the topology transaction in the ledger stream. */
  offset: z.number(),
  /** Record time of the topology transaction (ISO 8601). */
  recordTime: z.string(),
  /** Synchronizer ID for the topology transaction. */
  synchronizerId: z.string(),
  /** Events in the topology transaction. */
  events: z.array(
    z.object({
      /** Participant ID affected by the topology change. */
      participantId: z.string().optional(),
      /** Party ID affected by the topology change. */
      partyId: z.string().optional(),
      /** Permission level granted. */
      permission: z.string().optional(),
    })
  ),
});

/** WebSocket update wrappers (per AsyncAPI) - strictly typed server payloads. */
export const WsUpdateSchema = z.union([
  z.object({ OffsetCheckpoint: OffsetCheckpointSchema }),
  z.object({ Reassignment: JsReassignmentSchema }),
  z.object({ TopologyTransaction: WsTopologyTransactionSchema }),
  z.object({ Transaction: JsTransactionSchema }),
]);

export const WsUpdateTreesSchema = z.union([
  z.object({ OffsetCheckpoint: OffsetCheckpointSchema }),
  z.object({ Reassignment: JsReassignmentSchema }),
  z.object({ TransactionTree: JsTransactionTreeSchema }),
]);

/** Update stream request. */
export const UpdateStreamRequestSchema = z.object({
  /** User ID for the stream (optional if using authentication). */
  userId: z.string().optional(),
  /** Parties whose data should be included. */
  parties: z.array(z.string()),
  /** Beginning offset (exclusive) for resuming the stream. */
  beginExclusive: z.number().optional(),
  /** Event format (optional). */
  eventFormat: EventFormatSchema.optional(),
});

/** Update stream response. */
export const UpdateStreamResponseSchema = z.object({
  /** The update. */
  update: JsUpdateSchema,
});

/** Submit and wait for transaction request. */
export const JsSubmitAndWaitForTransactionRequestSchema = z.object({
  /** The commands to submit. */
  commands: JsCommandsSchema,
  /** Event format (optional). */
  eventFormat: EventFormatSchema.optional(),
});

/** Submit and wait for transaction response. */
export const JsSubmitAndWaitForTransactionResponseSchema = z.object({
  /** The transaction that resulted from the submitted command. */
  transaction: JsTransactionSchema,
});

/** Submit and wait response. */
export const SubmitAndWaitResponseSchema = z.object({
  /** The update that resulted from the submitted command. */
  update: JsUpdateSchema,
});

/** Get updates response (array of updates). */
export const GetUpdatesResponseSchema = z.array(
  z.object({
    /** The update. */
    update: JsUpdateSchema,
  })
);

/** Get update trees response (array of transaction trees). */
export const GetUpdateTreesResponseSchema = z.array(
  z.object({
    /** The update. */
    update: z.object({ JsTransactionTree: JsTransactionTreeSchema }),
  })
);

/** Get transaction response. */
export const GetTransactionResponseSchema = z.object({
  /** The transaction. */
  transaction: JsTransactionSchema,
});

/**
 * Event wrapper for tree events in GetTransaction responses. The API returns events in a flattened format like {
 * CreatedEvent: {...} } rather than the nested { CreatedTreeEvent: { value: {...} } } format used in streams. This
 * schema extracts the inner `value` from each tree event schema to match the actual response.
 */
export const TransactionTreeEventSchema = z.union([
  z.object({ ArchivedEvent: ArchivedTreeEventSchema.shape.ArchivedTreeEvent.shape.value }),
  z.object({ CreatedEvent: CreatedTreeEventSchema.shape.CreatedTreeEvent.shape.value }),
  z.object({ ExercisedEvent: ExercisedTreeEventSchema.shape.ExercisedTreeEvent.shape.value }),
]);

/**
 * Get transaction response (actual API response format). The API returns events as an array of tree events, not update
 * events.
 */
export const GetTransactionResponseActualSchema = z.object({
  /** The transaction. */
  transaction: z.object({
    /** Unique update ID for the transaction. */
    updateId: z.string(),
    /** Command ID associated with the transaction (optional). */
    commandId: z.string().optional(),
    /** Workflow ID associated with the transaction (optional). */
    workflowId: z.string().optional(),
    /** Effective time of the transaction (ISO 8601). */
    effectiveAt: z.string(),
    /** Offset of the transaction in the ledger stream. */
    offset: z.number(),
    /** Collection of tree events (not update events). */
    events: z.array(TransactionTreeEventSchema),
    /** Record time of the transaction. */
    recordTime: z.string(),
    /** Synchronizer ID for the transaction. */
    synchronizerId: z.string(),
    /** Trace context for distributed tracing (optional). */
    traceContext: TraceContextSchema.optional(),
  }),
});

/** Get update response. */
export const GetUpdateResponseSchema = z.object({
  /** The update. */
  update: JsUpdateSchema,
});

/** Get transaction tree response. */
export const GetTransactionTreeResponseSchema = z.object({
  /** The transaction tree. */
  transaction: JsTransactionTreeSchema,
});

// Export types
export type JsUpdateEventKind = z.infer<typeof JsUpdateEventKindSchema>;
export type JsUpdateEvent = z.infer<typeof JsUpdateEventSchema>;
export type JsTransaction = z.infer<typeof JsTransactionSchema>;
export type JsTransactionTree = z.infer<typeof JsTransactionTreeSchema>;
export type JsUpdate = z.infer<typeof JsUpdateSchema>;
export type WsTopologyTransaction = z.infer<typeof WsTopologyTransactionSchema>;
export type WsUpdate = z.infer<typeof WsUpdateSchema>;
export type WsUpdateTrees = z.infer<typeof WsUpdateTreesSchema>;
export type TransactionTreeEvent = z.infer<typeof TransactionTreeEventSchema>;
export type UpdateStreamRequest = z.infer<typeof UpdateStreamRequestSchema>;
export type UpdateStreamResponse = z.infer<typeof UpdateStreamResponseSchema>;
export type JsSubmitAndWaitForTransactionRequest = z.infer<typeof JsSubmitAndWaitForTransactionRequestSchema>;
export type JsSubmitAndWaitForTransactionResponse = z.infer<typeof JsSubmitAndWaitForTransactionResponseSchema>;
export type SubmitAndWaitResponse = z.infer<typeof SubmitAndWaitResponseSchema>;
export type GetUpdatesResponse = z.infer<typeof GetUpdatesResponseSchema>;
export type GetUpdateTreesResponse = z.infer<typeof GetUpdateTreesResponseSchema>;
export type GetTransactionResponse = z.infer<typeof GetTransactionResponseSchema>;
export type GetUpdateResponse = z.infer<typeof GetUpdateResponseSchema>;
export type GetTransactionTreeResponse = z.infer<typeof GetTransactionTreeResponseSchema>;
export type GetTransactionResponseActual = z.infer<typeof GetTransactionResponseActualSchema>;
