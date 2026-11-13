/**
 * Comparing template and interface ids across their two forms: package-name (`#package-name:Module:Entity`, as the
 * SDK's constants spell them so they survive DAR upgrades) and package-id (`pkgId:Module:Entity`, as the ledger reports
 * them).
 *
 * The ids themselves are the SDK's own: `DA_REGISTRY_TEMPLATES` (`da-registry/templates`) and the token standard V1
 * interface ids (`utils/token-standard/v1/constants`). Both modules are dependency-free, so this module can import them
 * and stay browser-safe.
 */

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
