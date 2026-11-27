#!/usr/bin/env tsx

/**
 * The package's `exports` map: the public entry points and nothing else. Run `npm run exports:sync` after changing it;
 * `test/unit/package-exports.test.ts` and `npm run exports:check` fail while `package.json` is out of step.
 *
 * - `.`: the Node SDK (`build/src/index.js`).
 * - `./wallets`: the browser-safe wallets module (`build/src/wallets/index.js`), which loads no Node dependency.
 * - `./external-parties`: the browser-safe external-party directory (`build/src/external-parties/index.js`), which loads
 *   `@fairmint/canton-protocol/party` and no Node dependency.
 * - `./package.json`: the manifest.
 *
 * No `./build/...` path is exported: code outside this package imports it only through these entry points, so a deep
 * path such as `@fairmint/canton-node-sdk/build/src/utils/transactions` fails with `ERR_PACKAGE_PATH_NOT_EXPORTED`.
 * Export a symbol a consumer needs from the root barrel (`src/index.ts`) instead.
 */
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';

type ExportTarget = string | { readonly types: string; readonly default: string };

const ROOT = path.resolve(__dirname, '..');

/** The `exports` map `package.json` must carry. */
export function expectedPackageExports(): Record<string, ExportTarget> {
  return {
    '.': { types: './build/src/index.d.ts', default: './build/src/index.js' },
    './wallets': { types: './build/src/wallets/index.d.ts', default: './build/src/wallets/index.js' },
    './external-parties': {
      types: './build/src/external-parties/index.d.ts',
      default: './build/src/external-parties/index.js',
    },
    './package.json': './package.json',
  };
}

function main(): void {
  const file = path.join(ROOT, 'package.json');
  const pkg = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
  const expected = expectedPackageExports();
  if (process.argv.includes('--check')) {
    if (JSON.stringify(pkg['exports']) !== JSON.stringify(expected)) {
      console.error('package.json exports are out of step with src/: run `npm run exports:sync`');
      process.exit(1);
    }
    console.log('✓ package.json exports match src/');
    return;
  }
  pkg['exports'] = expected;
  writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
  console.log(`✓ wrote ${Object.keys(expected).length} exports to package.json`);
}

if (require.main === module) main();
