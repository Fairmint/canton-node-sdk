/**
 * Branded types for domain-specific identifiers.
 *
 * Branded types use TypeScript's structural typing with a unique symbol to create nominally-typed aliases. This
 * prevents accidentally mixing up different ID types that are all strings at runtime.
 *
 * @example
 *   const contractId = 'abc' as ContractId;
 *   const partyId = 'xyz' as PartyId;
 *
 *   function useContract(id: ContractId): void {}
 *
 *   useContract(contractId); // OK
 *   useContract(partyId); // Type error!
 */

declare const brand: unique symbol;

/** A branded type that adds a unique brand to a base type */
type Brand<T, B extends string> = T & { readonly [brand]: B };

// Canton domain identifiers

/** A unique contract identifier on the ledger */
export type ContractId = Brand<string, 'ContractId'>;

/** A party identifier (e.g., "party::namespace") */
export type PartyId = Brand<string, 'PartyId'>;

/** A template identifier (e.g., "package:module:template") */
export type TemplateId = Brand<string, 'TemplateId'>;

/** A domain/synchronizer identifier */
export type DomainId = Brand<string, 'DomainId'>;

/** A command identifier for deduplication */
export type CommandId = Brand<string, 'CommandId'>;

/** A transaction identifier */
export type TransactionId = Brand<string, 'TransactionId'>;

/** An update identifier (offset) */
export type UpdateId = Brand<string, 'UpdateId'>;

/** A user identifier in the ledger API */
export type UserId = Brand<string, 'UserId'>;

/** A package identifier (hash) */
export type PackageId = Brand<string, 'PackageId'>;

/** An identity provider identifier */
export type IdentityProviderId = Brand<string, 'IdentityProviderId'>;

/** A workflow identifier for correlating commands */
export type WorkflowId = Brand<string, 'WorkflowId'>;

// Type guard helpers for runtime validation

/** Creates a branded ContractId from a string */
export function asContractId(value: string): ContractId {
  return value as ContractId;
}

/** Creates a branded PartyId from a string */
export function asPartyId(value: string): PartyId {
  return value as PartyId;
}

/** Creates a branded TemplateId from a string */
export function asTemplateId(value: string): TemplateId {
  return value as TemplateId;
}

/** Creates a branded DomainId from a string */
export function asDomainId(value: string): DomainId {
  return value as DomainId;
}

/** Creates a branded CommandId from a string */
export function asCommandId(value: string): CommandId {
  return value as CommandId;
}

/** Creates a branded TransactionId from a string */
export function asTransactionId(value: string): TransactionId {
  return value as TransactionId;
}

/** Creates a branded UpdateId from a string */
export function asUpdateId(value: string): UpdateId {
  return value as UpdateId;
}

/** Creates a branded UserId from a string */
export function asUserId(value: string): UserId {
  return value as UserId;
}

/** Creates a branded PackageId from a string */
export function asPackageId(value: string): PackageId {
  return value as PackageId;
}

/** Creates a branded IdentityProviderId from a string */
export function asIdentityProviderId(value: string): IdentityProviderId {
  return value as IdentityProviderId;
}

/** Creates a branded WorkflowId from a string */
export function asWorkflowId(value: string): WorkflowId {
  return value as WorkflowId;
}

// Type extraction helpers - get the underlying string type

/** Extracts the underlying string from a branded type */
export type Unbrand<T> = T extends Brand<infer U, string> ? U : T;
