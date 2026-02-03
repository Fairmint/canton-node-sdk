/**
 * Transaction types from the Ledger API protobufs.
 * These types correspond to com.daml.ledger.api.v2.transaction.proto
 *
 * @see https://docs.digitalasset.com/build/3.4/reference/lapi-proto-docs.html
 */

import { type Event, type TreeEvent } from './events';

/** A flat transaction (shows creates and archives only). */
export interface Transaction {
  /** The ID of the transaction. */
  updateId: string;
  /** The command ID that generated this transaction. */
  commandId: string;
  /** The workflow ID associated with this transaction. */
  workflowId?: string;
  /** Ledger-effective time. */
  ledgerEffectiveTime?: { seconds: number; nanos: number };
  /** The flat events in this transaction. */
  events: Event[];
  /** The offset of this transaction. */
  offset: number;
  /** The synchronizer ID where this transaction was recorded. */
  synchronizerId: string;
  /** Trace context for distributed tracing. */
  traceContext?: TraceContext;
  /** Recording time on the synchronizer. */
  recordTime?: { seconds: number; nanos: number };
}

/** A transaction tree (shows full execution tree including exercises). */
export interface TransactionTree {
  /** The ID of the transaction. */
  updateId: string;
  /** The command ID that generated this transaction. */
  commandId: string;
  /** The workflow ID associated with this transaction. */
  workflowId?: string;
  /** Ledger-effective time. */
  ledgerEffectiveTime?: { seconds: number; nanos: number };
  /** The offset of this transaction. */
  offset: number;
  /** Map from event ID to event. */
  eventsById: Record<string, TreeEvent>;
  /** IDs of root events. */
  rootEventIds: string[];
  /** The synchronizer ID where this transaction was recorded. */
  synchronizerId: string;
  /** Trace context for distributed tracing. */
  traceContext?: TraceContext;
  /** Recording time on the synchronizer. */
  recordTime?: { seconds: number; nanos: number };
}

/** Trace context for distributed tracing. */
export interface TraceContext {
  /** W3C traceparent header value. */
  traceparent?: string;
  /** W3C tracestate header value. */
  tracestate?: string;
}

/** A completion for a submitted command. */
export interface Completion {
  /** The command ID. */
  commandId: string;
  /** Status of the completion. */
  status?: CompletionStatus;
  /** The transaction ID if successful. */
  updateId?: string;
  /** The user ID that submitted the command. */
  userId: string;
  /** The parties that submitted the command. */
  actAs: string[];
  /** The submission ID. */
  submissionId?: string;
  /** The deduplication period used. */
  deduplicationPeriod?: DeduplicationPeriod;
  /** Trace context. */
  traceContext?: TraceContext;
  /** The offset of this completion. */
  offset: number;
  /** The synchronizer ID. */
  synchronizerId?: string;
}

/** Status of a completion. */
export interface CompletionStatus {
  /** gRPC status code. */
  code: number;
  /** Error message if failed. */
  message?: string;
  /** Detailed error information. */
  details?: unknown[];
}

/** Deduplication period used for a command. */
export interface DeduplicationPeriod {
  deduplicationOffset?: number;
  deduplicationDuration?: { seconds: number; nanos: number };
}

/** Helper to check if a completion was successful. */
export function isSuccessfulCompletion(completion: Completion): boolean {
  return !completion.status || completion.status.code === 0;
}

/** Helper to get root events from a transaction tree. */
export function getRootEvents(tree: TransactionTree): TreeEvent[] {
  return tree.rootEventIds.map((id) => tree.eventsById[id]).filter((e): e is TreeEvent => e !== undefined);
}

/** Helper to walk through all events in a transaction tree in order. */
export function walkTransactionTree(
  tree: TransactionTree,
  callback: (event: TreeEvent, eventId: string, depth: number) => void
): void {
  const visited = new Set<string>();

  function visit(eventId: string, depth: number): void {
    if (visited.has(eventId)) return;
    visited.add(eventId);

    const event = tree.eventsById[eventId];
    if (!event) return;

    callback(event, eventId, depth);

    // If it's an exercised event, visit children
    if (event.exercised) {
      for (const childId of event.exercised.childEventIds) {
        visit(childId, depth + 1);
      }
    }
  }

  for (const rootId of tree.rootEventIds) {
    visit(rootId, 0);
  }
}
