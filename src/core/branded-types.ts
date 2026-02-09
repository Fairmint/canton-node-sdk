/**
 * Branded types for domain-specific identifiers.
 *
 * Branded types use TypeScript's structural typing with a unique symbol to create nominally-typed aliases. This
 * prevents accidentally mixing up different ID types that are all strings at runtime.
 *
 * Use the helper functions (`PartyId()`, `ContractId()`, etc.) to create branded values from plain strings:
 *
 * @example
 *   const party = PartyId('alice::namespace');
 *   const contract = ContractId('abc123');
 *
 *   function useContract(id: ContractId): void {}
 *
 *   useContract(contract); // OK
 *   useContract(party); // Type error!
 */

declare const brand: unique symbol;

/** A branded type that adds a unique brand to a base type. */
export type Brand<T, B extends string> = T & { readonly [brand]: B };

// Canton domain identifiers

/** A unique contract identifier on the ledger. */
export type ContractId = Brand<string, 'ContractId'>;

/** A party identifier (e.g., "party::namespace"). */
export type PartyId = Brand<string, 'PartyId'>;

/** A template identifier (e.g., "package:module:template"). */
export type TemplateId = Brand<string, 'TemplateId'>;

/** A domain/synchronizer identifier. */
export type DomainId = Brand<string, 'DomainId'>;

/** A command identifier for deduplication. */
export type CommandId = Brand<string, 'CommandId'>;

/** A transaction identifier. */
export type TransactionId = Brand<string, 'TransactionId'>;

/** An update identifier (offset). */
export type UpdateId = Brand<string, 'UpdateId'>;

/** A user identifier in the ledger API. */
export type UserId = Brand<string, 'UserId'>;

/** A package identifier (hash). */
export type PackageId = Brand<string, 'PackageId'>;

/** An identity provider identifier. */
export type IdentityProviderId = Brand<string, 'IdentityProviderId'>;

/** A workflow identifier for correlating commands. */
export type WorkflowId = Brand<string, 'WorkflowId'>;

// Helper functions to create branded types from plain strings.
// These are zero-cost at runtime (just a cast) but enforce type safety at compile time.

/** Creates a {@link ContractId} from a plain string. */
export function ContractId(value: string): ContractId {
  return value as ContractId;
}

/** Creates a {@link PartyId} from a plain string. */
export function PartyId(value: string): PartyId {
  return value as PartyId;
}

/** Creates a {@link TemplateId} from a plain string. */
export function TemplateId(value: string): TemplateId {
  return value as TemplateId;
}

/** Creates a {@link DomainId} from a plain string. */
export function DomainId(value: string): DomainId {
  return value as DomainId;
}

/** Creates a {@link CommandId} from a plain string. */
export function CommandId(value: string): CommandId {
  return value as CommandId;
}

/** Creates a {@link TransactionId} from a plain string. */
export function TransactionId(value: string): TransactionId {
  return value as TransactionId;
}

/** Creates an {@link UpdateId} from a plain string. */
export function UpdateId(value: string): UpdateId {
  return value as UpdateId;
}

/** Creates a {@link UserId} from a plain string. */
export function UserId(value: string): UserId {
  return value as UserId;
}

/** Creates a {@link PackageId} from a plain string. */
export function PackageId(value: string): PackageId {
  return value as PackageId;
}

/** Creates an {@link IdentityProviderId} from a plain string. */
export function IdentityProviderId(value: string): IdentityProviderId {
  return value as IdentityProviderId;
}

/** Creates a {@link WorkflowId} from a plain string. */
export function WorkflowId(value: string): WorkflowId {
  return value as WorkflowId;
}
