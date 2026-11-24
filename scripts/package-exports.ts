#!/usr/bin/env tsx

/**
 * The package's `exports` map, derived from `src/`. Run `npm run exports:sync` after adding or removing a directory
 * with an `index.ts`; `test/unit/package-exports.test.ts` fails while `package.json` is out of step.
 *
 * - `.`: the Node SDK (`build/src/index.js`).
 * - `./wallets`: the browser-safe wallets module (`build/src/wallets/index.js`), which loads no Node dependency.
 * - `./external-parties`: the browser-safe external-party discovery module (`build/src/external-parties/index.js`), which
 *   loads `@noble/hashes` and no Node dependency.
 * - `./build/...`: every deep path that worked before the map existed, so no consumer breaks. Node's `exports` does not
 *   add extensions or look for `index.js`, so the map spells them out: `.js` and `.d.ts` paths as they are,
 *   extensionless file paths with `.js` added, and one entry per directory with an `index.ts` (its `index.js`).
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import path from 'path';

type ExportTarget = string | { readonly types: string; readonly default: string };

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');

/** Directories under `src/` (itself included) that hold an `index.ts`, as `src`-relative POSIX paths (`''` for src). */
function indexDirectories(dir: string = SRC): string[] {
  const own = statSync(path.join(dir, 'index.ts'), { throwIfNoEntry: false })?.isFile() === true;
  const nested = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => indexDirectories(path.join(dir, entry.name)));
  return [...(own ? [path.relative(SRC, dir).split(path.sep).join('/')] : []), ...nested].sort();
}

/** The `exports` map `package.json` must carry. */
export function expectedPackageExports(): Record<string, ExportTarget> {
  const directories = Object.fromEntries(
    indexDirectories().map((dir) => {
      const subpath = dir === '' ? './build/src' : `./build/src/${dir}`;
      return [subpath, `${subpath}/index.js`];
    })
  );
  return {
    '.': { types: './build/src/index.d.ts', default: './build/src/index.js' },
    './wallets': { types: './build/src/wallets/index.d.ts', default: './build/src/wallets/index.js' },
    './external-parties': {
      types: './build/src/external-parties/index.d.ts',
      default: './build/src/external-parties/index.js',
    },
    './package.json': './package.json',
    ...directories,
    './build/*.js': './build/*.js',
    './build/*.d.ts': './build/*.d.ts',
    './build/*': './build/*.js',
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
