import { z } from 'zod';
import { TraceContextSchema } from '../common';
import { ledgerNullableOptionalResponseField, ledgerOptionalPaidTrafficCostSchema } from '../wire';
import { JsCommandsSchema } from './commands';
import { OffsetCheckpointSchema } from './completions';
import {
  ArchivedEventDetailsSchema,
  CreatedEventDetailsSchema,
  ExercisedEventDetailsSchema,
} from './event-details';
import {
  ArchivedTreeEventSchema,
  CreatedTreeEventSchema,
  EventFormatSchema,
  ExercisedTreeEventSchema,
  TreeEventSchema,
} from './events';
import { JsReassignmentSchema } from './reassignment';

/**
 * Events inside a JsTransaction (AsyncAPI `Event`).
 *
 * - ACS_DELTA: CreatedEvent | ArchivedEvent
 * - LEDGER_EFFECTS: CreatedEvent | ExercisedEvent
 */
export const TransactionEventSchema = z.union([
  z.object({ CreatedEvent: CreatedEventDetailsSchema }),
  z.object({ ArchivedEvent: ArchivedEventDetailsSchema }),
  z.object({ ExercisedEvent: ExercisedEventDetailsSchema }),
]);

/** Transaction details (AsyncAPI `JsTransaction`). */
export const JsTransactionSchema = z.looseObject({
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
  /** Collection of transaction events (Created/Archived/Exercised). */
  events: z.array(TransactionEventSchema),
  /** Synchronizer that synchronized the transaction. */
  synchronizerId: z.string(),
  /**
   * Trace context (optional). Splice/Canton wire often sends `null` when absent; outputs normalize to `undefined`.
   */
  traceContext: ledgerNullableOptionalResponseField(TraceContextSchema),
  /** Record time of the transaction. */
  recordTime: z.string(),
  /**
   * External transaction hash for externally signed submissions (optional). Wire may send `null`; outputs normalize
   * to `undefined`.
   */
  externalTransactionHash: ledgerNullableOptionalResponseField(z.string()),
  /** Traffic cost paid by this participant for the confirmation request (optional). */
  paidTrafficCost: ledgerOptionalPaidTrafficCostSchema,
});

/** Transaction tree details. */
export const JsTransactionTreeSchema = z.looseObject({
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
  /** Synchronizer that synchronized the transaction. */
  synchronizerId: z.string(),
  /** Trace context (optional; wire may be null → undefined). */
  traceContext: ledgerNullableOptionalResponseField(TraceContextSchema),
  /** Record time of the transaction. */
  recordTime: z.string(),
});

/** Update (oneOf transaction or transaction tree) — REST/JS naming variants. */
export const JsUpdateSchema = z.union([
  z.object({ JsTransaction: JsTransactionSchema }),
  z.object({ JsTransactionTree: JsTransactionTreeSchema }),
  z.object({ OffsetCheckpoint: OffsetCheckpointSchema }),
]);

/** Topology authorization event payloads (AsyncAPI `TopologyEventEvent`). */
const TopologyAuthorizationValueSchema = z.object({
  partyId: z.string(),
  participantId: z.string(),
  participantPermission: z.string().optional(),
});

const TopologyEventEventSchema = z.union([
  z.object({ Empty: z.object({}) }),
  z.object({ ParticipantAuthorizationAdded: z.object({ value: TopologyAuthorizationValueSchema }) }),
  z.object({ ParticipantAuthorizationChanged: z.object({ value: TopologyAuthorizationValueSchema }) }),
  z.object({
    ParticipantAuthorizationRevoked: z.object({
      value: z.object({
        partyId: z.string(),
        participantId: z.string(),
      }),
    }),
  }),
]);

/** Topology transaction event schema for WebSocket streams (AsyncAPI `TopologyEvent`). */
export const WsTopologyEventSchema = z.looseObject({
  event: TopologyEventEventSchema.optional(),
});

/** Topology transaction body (AsyncAPI `JsTopologyTransaction`). */
export const WsTopologyTransactionSchema = z.looseObject({
  /** Unique update ID for the topology transaction. */
  updateId: z.string(),
  /** Offset of the topology transaction in the ledger stream. */
  offset: z.number(),
  /** Record time of the topology transaction (ISO 8601). */
  recordTime: z.string(),
  /** Synchronizer ID for the topology transaction. */
  synchronizerId: z.string(),
  /** Events in the topology transaction. */
  events: z.array(WsTopologyEventSchema),
  /** Trace context (optional; wire may be null → undefined). */
  traceContext: ledgerNullableOptionalResponseField(TraceContextSchema),
});

/**
 * WebSocket `/v2/updates` update wrappers (AsyncAPI `Update`).
 *
 * Transaction, Reassignment, and TopologyTransaction are value-wrapped on the wire (`{ Transaction: { value:
 * JsTransaction } }`), matching OffsetCheckpoint / Completion.
 *
 * Hard-fail (not fail-soft) on unknown frames: discovery/save workers must not skip Transaction updates or they will
 * silently lose ledger data while appearing stuck.
 */
export const WsUpdateSchema = z.union([
  z.object({ OffsetCheckpoint: OffsetCheckpointSchema }),
  z.object({ Reassignment: z.object({ value: JsReassignmentSchema }) }),
  z.object({ TopologyTransaction: z.object({ value: WsTopologyTransactionSchema }) }),
  z.object({ Transaction: z.object({ value: JsTransactionSchema }) }),
]);

/** WebSocket `/v2/updates/trees` update wrappers (deprecated trees endpoint). */
export const WsUpdateTreesSchema = z.union([
  z.object({ OffsetCheckpoint: OffsetCheckpointSchema }),
  z.object({ Reassignment: z.object({ value: JsReassignmentSchema }) }),
  z.object({ TransactionTree: z.object({ value: JsTransactionTreeSchema }) }),
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
    /** Trace context for distributed tracing (optional; wire may be null → undefined). */
    traceContext: ledgerNullableOptionalResponseField(TraceContextSchema),
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
export type TransactionEvent = z.infer<typeof TransactionEventSchema>;
export type JsTransaction = z.infer<typeof JsTransactionSchema>;
export type JsTransactionTree = z.infer<typeof JsTransactionTreeSchema>;
export type JsUpdate = z.infer<typeof JsUpdateSchema>;
export type WsTopologyEvent = z.infer<typeof WsTopologyEventSchema>;
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
