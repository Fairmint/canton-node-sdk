import { buildReferenceManifest } from '../../../scripts/export-reference-manifest';

describe('export-reference-manifest', () => {
  it('includes main categories, entry surface, and generated client methods', () => {
    const manifest = buildReferenceManifest();

    expect(manifest.package.name).toBe('@fairmint/canton-node-sdk');
    expect(manifest.package.version).toMatch(/^\d+\.\d+\.\d+/);

    const ids = manifest.categories.map((c) => c.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'entry',
        'client-ledger-json-api',
        'client-validator-api',
        'client-scan-api',
        'core',
        'utilities',
        'examples',
        'scripts',
      ])
    );

    const entry = manifest.categories.find((c) => c.id === 'entry');
    expect(entry?.members.some((m) => m.name === 'Canton' && m.kind === 'class')).toBe(true);
    expect(entry?.members.some((m) => m.parent === 'CantonConfig')).toBe(true);

    const ledger = manifest.categories.find((c) => c.id === 'client-ledger-json-api');
    const clientBlock = ledger?.members.find((m) => m.kind === 'client-class');
    const methods = clientBlock?.members ?? [];
    expect(methods.length).toBeGreaterThan(40);
    expect(methods.some((m) => m.name === 'getVersion')).toBe(true);

    const wsMethod = methods.find((m) => m.name === 'subscribeToUpdates');
    expect(wsMethod?.transport).toBe('websocket');

    expect((manifest.categories.find((c) => c.id === 'core')?.members.length ?? 0) > 0).toBe(true);
    expect((manifest.categories.find((c) => c.id === 'utilities')?.members.length ?? 0) > 0).toBe(
      true
    );
  });
});
