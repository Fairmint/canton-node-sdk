/**
 * The package's `exports` map: `./wallets` is the browser-safe entry, and every deep `build/...` path that worked
 * before the map existed still resolves (Node's `exports` adds no extensions and finds no `index.js` by itself).
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

  it('export the SDK at the root and the browser-safe wallets module at ./wallets, with types', () => {
    expect(pkg.exports['.']).toEqual({ types: `./${pkg.types}`, default: `./${pkg.main}` });
    expect(pkg.exports['./wallets']).toEqual({
      types: './build/src/wallets/index.d.ts',
      default: './build/src/wallets/index.js',
    });
    // TypeScript's classic (node10) resolution ignores `exports`; typesVersions gives it the wallets types.
    expect(pkg.typesVersions).toEqual({ '*': { wallets: ['build/src/wallets/index.d.ts'] } });
  });

  it('keep the deep paths consumers import: files with or without .js, and directories with an index', () => {
    const exportsMap = pkg.exports;
    expect(exportsMap['./build/*.js']).toBe('./build/*.js');
    expect(exportsMap['./build/*.d.ts']).toBe('./build/*.d.ts');
    expect(exportsMap['./build/*']).toBe('./build/*.js');
    expect(exportsMap['./build/src/utils/transactions']).toBe('./build/src/utils/transactions/index.js');
    expect(exportsMap['./build/src/clients/ledger-json-api/operations']).toBe(
      './build/src/clients/ledger-json-api/operations/index.js'
    );
    expect(exportsMap['./build/src']).toBe('./build/src/index.js');
  });
});
