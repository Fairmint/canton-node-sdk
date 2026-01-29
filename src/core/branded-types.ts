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
