/**
 * Event types from the Ledger API protobufs.
 * These types correspond to com.daml.ledger.api.v2.event.proto
 *
 * @see https://docs.digitalasset.com/build/3.4/reference/lapi-proto-docs.html
 */

import type { DamlRecord, Identifier, Value } from './value';

/** Cryptographic hash info. */
export interface HashInfo {
  /** Raw hash bytes. */
  raw: Uint8Array;
}

/** Records that a contract has been created. */
export interface CreatedEvent {
  /** The offset at which this event was recorded. */
  offset: number;
  /** Node ID within the transaction. */
  nodeId: number;
  /** The ID of this particular contract. */
  contractId: string;
  /** The template of the created contract. */
  templateId: Identifier;
  /** The arguments that were used to create the contract. */
  createArguments?: DamlRecord;
  /** Opaque blob for disclosed contracts. */
  createdEventBlob: Uint8Array;
  /** Interface views (interface ID -> view record). */
  interfaceViews: InterfaceView[];
  /** Ledger-effective time when the transaction was recorded. */
  ledgerEffectiveTime?: { seconds: number; nanos: number };
  /** Signatories of the contract. */
  signatories: string[];
  /** Observers of the contract. */
  observers: string[];
  /** The contract key, if defined. */
  contractKey?: Value;
  /** Package name of the template. */
  packageName: string;
}

/** An interface view of a contract. */
export interface InterfaceView {
  /** The interface ID. */
  interfaceId: Identifier;
  /** The view record. */
  viewValue?: DamlRecord;
  /** Status if view computation failed. */
  viewStatus?: ViewStatus;
}

/** Status of interface view computation. */
export interface ViewStatus {
  /** Error code. */
  code: number;
  /** Error message. */
  message: string;
}

/** Records that a contract has been archived. */
export interface ArchivedEvent {
  /** The offset at which this event was recorded. */
  offset: number;
  /** Node ID within the transaction. */
  nodeId: number;
  /** The ID of the archived contract. */
  contractId: string;
  /** The template of the archived contract. */
  templateId: Identifier;
  /** Package name of the template. */
  packageName: string;
}

/** Records that a choice was exercised on a contract. */
export interface ExercisedEvent {
  /** The offset at which this event was recorded. */
  offset: number;
  /** Node ID within the transaction. */
  nodeId: number;
  /** The ID of the target contract. */
  contractId: string;
  /** The template of the target contract. */
  templateId: Identifier;
  /** Interface ID if exercised through an interface. */
  interfaceId?: Identifier;
  /** Package name of the template. */
  packageName: string;
  /** The choice that was exercised. */
  choice: string;
  /** The argument of the exercised choice. */
  choiceArgument: Value;
  /** The parties that exercised the choice. */
  actingParties: string[];
  /** Whether this was a consuming choice. */
  consuming: boolean;
  /** The result of exercising the choice. */
  exerciseResult: Value;
  /** Child event IDs (for TransactionTree). */
  childEventIds: string[];
  /** Last descendant node ID. */
  lastDescendantNodeId?: number;
}

/** An event in a flat transaction. */
export interface Event {
  created?: CreatedEvent;
  archived?: ArchivedEvent;
}

/** An event in a transaction tree. */
export interface TreeEvent {
  created?: CreatedEvent;
  exercised?: ExercisedEvent;
}

/** Helper to check if an event is a CreatedEvent. */
export function isCreatedEvent(event: Event | TreeEvent): event is { created: CreatedEvent } {
  return event.created != null;
}

/** Helper to check if an event is an ArchivedEvent. */
export function isArchivedEvent(event: Event): event is { archived: ArchivedEvent } {
  return event.archived != null;
}

/** Helper to check if an event is an ExercisedEvent. */
export function isExercisedEvent(event: TreeEvent): event is { exercised: ExercisedEvent } {
  return event.exercised != null;
}
