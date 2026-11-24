/**
 * The package's `exports` map: the root, the browser-safe `./wallets` and `./external-parties` entries, and
 * `./package.json`. No deep `build/...` path is exported, so consumers import only through the public entry points.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { expectedPackageExports } from '../../scripts/package-exports';

const ROOT = path.resolve(__dirname, '../..');
const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as {
  exports: Record<string, unknown>;
  main: string;
  types: string;
  typesVersions: Record<string, Record<string, string[]>>;
};

describe('package exports', () => {
  it('match src/ (run `npm run exports:sync` after adding or removing a directory with an index.ts)', () => {
    expect(pkg.exports).toEqual(expectedPackageExports());
  });

  it('export the SDK at the root and the browser-safe modules at ./wallets and ./external-parties, with types', () => {
    expect(pkg.exports['.']).toEqual({ types: `./${pkg.types}`, default: `./${pkg.main}` });
    expect(pkg.exports['./wallets']).toEqual({
      types: './build/src/wallets/index.d.ts',
      default: './build/src/wallets/index.js',
    });
    expect(pkg.exports['./external-parties']).toEqual({
      types: './build/src/external-parties/index.d.ts',
      default: './build/src/external-parties/index.js',
    });
    // TypeScript's classic (node10) resolution ignores `exports`; typesVersions gives it the subpath types, keeps the
    // root's `types` file, and sends every other `build/...` path to a file that does not exist, so a deep import
    // fails to typecheck there too (TS2307) instead of compiling and failing at runtime.
    expect(pkg.typesVersions).toEqual({
      '*': {
        wallets: ['build/src/wallets/index.d.ts'],
        'external-parties': ['build/src/external-parties/index.d.ts'],
        'build/src/index.d.ts': ['build/src/index.d.ts'],
        'build/*': ['./deep-imports-are-not-exported.d.ts'],
      },
    });
  });

  it('export only the public entry points: no deep build/... path', () => {
    expect(Object.keys(pkg.exports).sort()).toEqual(['.', './external-parties', './package.json', './wallets']);
    const deep = Object.keys(pkg.exports).filter((key) => key.startsWith('./build'));
    expect(deep).toEqual([]);
    for (const former of [
      './build/*',
      './build/*.js',
      './build/*.d.ts',
      './build/src',
      './build/src/wallets',
      './build/src/utils/transactions',
      './build/src/clients/ledger-json-api/operations',
    ]) {
      expect(pkg.exports).not.toHaveProperty([former]);
    }
  });
});
