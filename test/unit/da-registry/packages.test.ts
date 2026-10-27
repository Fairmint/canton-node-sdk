import {
  DA_REGISTRY_BUNDLE_VERSION,
  DA_REGISTRY_PACKAGE_IDS,
  DA_REGISTRY_PACKAGES,
  DA_REGISTRY_TEMPLATES,
} from '../../../src/da-registry';

const PACKAGE_ID_PATTERN = /^[0-9a-f]{64}$/;

describe('DA registry package pins', () => {
  it('pins every bundle package by content-hash id', () => {
    expect(DA_REGISTRY_PACKAGES.length).toBeGreaterThan(0);
    for (const pkg of DA_REGISTRY_PACKAGES) {
      expect(pkg.name).toMatch(/^utility-/);
      expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(pkg.packageId).toMatch(PACKAGE_ID_PATTERN);
    }
  });

  it('covers every package the template ids reference', () => {
    const pinnedNames = new Set(DA_REGISTRY_PACKAGES.map((p) => p.name));
    const referenced = new Set(Object.values(DA_REGISTRY_TEMPLATES).map((t) => t.slice(1, t.indexOf(':'))));
    // splice-api-token-transfer-instruction-v1 is a Splice package, not part of DA's bundle.
    expect([...referenced].every((name) => pinnedNames.has(name))).toBe(true);
  });

  it('exposes the bundle version and the package ids for submission preference', () => {
    expect(DA_REGISTRY_BUNDLE_VERSION).toBe('0.14.4');
    expect(DA_REGISTRY_PACKAGE_IDS).toEqual(DA_REGISTRY_PACKAGES.map((p) => p.packageId));
  });
});
