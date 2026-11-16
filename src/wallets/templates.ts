/**
 * Comparing template and interface ids across their two forms: package-name (`#package-name:Module:Entity`, as the
 * SDK's constants spell them so they survive DAR upgrades) and package-id (`pkgId:Module:Entity`, as the ledger reports
 * them).
 *
 * The ids themselves are the SDK's own: `DA_REGISTRY_TEMPLATES` (`da-registry/templates`) and the token standard V1
 * interface ids (`utils/token-standard/v1/constants`). Both modules are dependency-free, so this module can import them
 * and stay browser-safe.
 */
import type { ActiveContract, ContractFilter } from './types';

/**
 * `Module:Entity` of a template or interface id in either form (`#pkg-name:M:E` or `pkgId:M:E`), or null when the id is
 * not of that shape.
 */
export function qualifiedName(id: string): string | null {
  const separator = id.indexOf(':');
  if (separator <= 0) return null;
  const rest = id.slice(separator + 1);
  return /^[A-Za-z0-9_.]+:[A-Za-z0-9_.]+$/.test(rest) ? rest : null;
}

/** Whether two ids name the same template or interface, whatever package version or id form each uses. */
export function sameQualifiedName(left: string, right: string): boolean {
  const name = qualifiedName(left);
  return name !== null && name === qualifiedName(right);
}

/** The package name of a package-name form id (`#package-name:Module:Entity`), or null for any other form. */
export function packageNameOf(id: string): string | null {
  if (!id.startsWith('#')) return null;
  const separator = id.indexOf(':');
  return separator > 1 ? id.slice(1, separator) : null;
}

/** `Module:Entity` of one of the SDK's own id constants; throws on a malformed constant rather than matching nothing. */
export function requireQualifiedName(id: string): string {
  const name = qualifiedName(id);
  if (name === null) throw new TypeError(`Malformed template id ${id}`);
  return name;
}

/** A stable key of a filter: `t:<templateId>` or `i:<interfaceId>`. */
export function contractFilterKey(filter: ContractFilter): string {
  return 'templateId' in filter ? `t:${filter.templateId}` : `i:${filter.interfaceId}`;
}

/**
 * Whether a contract of a snapshot read with several filters at once is one the given filter would have returned on its
 * own: of the template, or carrying a view of the interface (the ledger computes views only for the interfaces the read
 * asked for).
 *
 * A template match needs proven package identity, not just the same `Module:Entity`: a cumulative read also returns
 * contracts matched only by one of its interface filters, and any party can create a template of that name in its own
 * package. So a package-name filter (`#pkg:M:E`) matches only a contract whose `packageName` is that package; the
 * Ledger JSON API v2 (Canton 3.x) always reports `createdEvent.packageName` (a required field), so a contract without
 * one is not classified at all (fail closed). A package-id filter matches only the exact template id.
 */
export function contractMatchesFilter(contract: ActiveContract, filter: ContractFilter): boolean {
  if ('templateId' in filter) {
    if (!sameQualifiedName(contract.templateId, filter.templateId)) return false;
    const filterPackage = packageNameOf(filter.templateId);
    return filterPackage === null
      ? contract.templateId === filter.templateId
      : contract.packageName !== undefined && contract.packageName === filterPackage;
  }
  // Same rule for interfaces: a package-id filter (`pkgId:M:E`) matches only that exact interface id, so two
  // same-named interfaces from different packages in one cumulative read are never mixed up; a package-name filter
  // (`#pkg:M:E`) matches by name (the ledger reports a view's interface id with the package id it resolved).
  return contract.interfaceViews.some((view) =>
    packageNameOf(filter.interfaceId) === null
      ? view.interfaceId === filter.interfaceId
      : sameQualifiedName(view.interfaceId, filter.interfaceId)
  );
}
