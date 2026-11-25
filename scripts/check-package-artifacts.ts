#!/usr/bin/env tsx

/**
 * Repeatable npm package boundary check for @fairmint/canton-node-sdk.
 *
 * Production surface: build/src/** (+ package metadata). LocalNet CLI/helpers live in @fairmint/canton-dev-tools and
 * must not ship in this package.
 */

import { spawnSync, type SpawnSyncReturns } from 'child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'fs';
import os from 'os';
import path from 'path';

interface NpmPackFile {
  path: string;
  size: number;
  mode: number;
}

interface NpmPackResult {
  id: string;
  name: string;
  version: string;
  size: number;
  unpackedSize: number;
  filename: string;
  files: NpmPackFile[];
}

const DEFAULT_MAX_UNPACKED_BYTES = 15 * 1024 * 1024;
const configuredMaxUnpackedBytes = process.env['MAX_PACKAGE_UNPACKED_BYTES'];
const maxUnpackedBytes = parseMaxUnpackedBytes(configuredMaxUnpackedBytes);

const REQUIRED_RUNTIME_PATHS = [
  'build/src/index.js',
  'build/src/index.d.ts',
  'build/src/clients/ledger-json-api/operations/v2/contracts/get-contract-by-id.d.ts',
  'build/src/clients/ledger-json-api/operations/v2/dars/upload-dar.d.ts',
  'build/src/clients/ledger-json-api/operations/v2/dars/validate-dar.d.ts',
  // The browser-safe wallets entry point (`exports` `./wallets`).
  'build/src/wallets/index.js',
  'build/src/wallets/index.d.ts',
  // The browser-safe external-party discovery entry point (`exports` `./external-parties`).
  'build/src/external-parties/index.js',
  'build/src/external-parties/index.d.ts',
] as const;

/**
 * Loaded by browser bundles: each must require nothing but relative SDK files and the listed browser-safe packages (no
 * axios, ws, pino, dotenv, glob).
 */
const BROWSER_SAFE_ENTRIES: ReadonlyArray<{ readonly entry: string; readonly packages: readonly string[] }> = [
  { entry: 'build/src/wallets/index.js', packages: [] },
  { entry: 'build/src/external-parties/index.js', packages: ['@noble/hashes/sha2'] },
];

const FORBIDDEN_LOCALNET_ENGINE_PATHS = ['bin/canton-localnet', 'scripts/localnet-cloud.sh'] as const;

function formatBytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function parseMaxUnpackedBytes(rawValue: string | undefined): number {
  const parsedValue = rawValue === undefined ? DEFAULT_MAX_UNPACKED_BYTES : Number(rawValue);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw new Error(`MAX_PACKAGE_UNPACKED_BYTES must be a positive integer in bytes, got ${JSON.stringify(rawValue)}`);
  }

  return parsedValue;
}

function forbiddenPackagePathReason(packagePath: string): string | null {
  if (packagePath.endsWith('.dar')) return 'DAML DAR files are not runtime SDK artifacts';
  if (packagePath === 'libs' || packagePath.startsWith('libs/')) {
    return 'submodules under libs/ must not be published';
  }
  if (packagePath === 'fixtures' || packagePath.startsWith('fixtures/')) {
    return 'test fixtures must not be published';
  }
  if (packagePath === 'test' || packagePath.startsWith('test/')) {
    return 'source tests must not be published';
  }
  if (packagePath === 'build/test' || packagePath.startsWith('build/test/')) {
    return 'compiled tests are CI-only and must not be published';
  }
  if (packagePath === 'build/scripts' || packagePath.startsWith('build/scripts/')) {
    return 'compiled repo scripts are CI-only and must not be published';
  }
  if (packagePath === 'build/examples' || packagePath.startsWith('build/examples/')) {
    return 'compiled examples are CI-only and must not be published';
  }
  if (packagePath === 'bin' || packagePath.startsWith('bin/')) {
    return 'LocalNet CLI belongs in @fairmint/canton-dev-tools, not this SDK';
  }
  if (packagePath === 'scripts' || packagePath.startsWith('scripts/')) {
    return 'repo scripts (including LocalNet) must not be published';
  }
  if (packagePath === 'node_modules' || packagePath.startsWith('node_modules/')) {
    return 'node_modules must not be published';
  }
  if (packagePath === 'core' || packagePath.startsWith('core.')) {
    return 'crash dumps must not be published';
  }
  return null;
}

function parsePackResults(stdout: string): NpmPackResult[] {
  try {
    return JSON.parse(stdout) as NpmPackResult[];
  } catch (error) {
    throw new Error(`npm pack did not return valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function spawnFailureDetails(command: string, result: SpawnSyncReturns<string>): string {
  const details = [`status ${result.status ?? 'unknown'}`];

  if (result.signal) {
    details.push(`signal ${result.signal}`);
  }
  if (result.error) {
    details.push(`error ${result.error.message}`);
  }

  return `${command} failed (${details.join(', ')})`;
}

function throwIfSpawnFailed(command: string, result: SpawnSyncReturns<string>): void {
  if (result.status === 0 && !result.signal && !result.error) {
    return;
  }

  if (result.stderr) {
    console.error(result.stderr);
  }
  if (result.stdout) {
    console.error(result.stdout);
  }

  throw new Error(spawnFailureDetails(command, result));
}

const prepack = spawnSync('npm', ['run', 'prepack'], {
  encoding: 'utf8',
});
throwIfSpawnFailed('npm run prepack', prepack);

const packArgs = [
  'pack',
  '--dry-run',
  '--json',
  // prepack already produced the publish-time build; keep this inspection step JSON-only.
  '--ignore-scripts',
];

const pack = spawnSync('npm', packArgs, {
  encoding: 'utf8',
});
throwIfSpawnFailed(`npm ${packArgs.join(' ')}`, pack);

const [result] = parsePackResults(pack.stdout);
if (!result) {
  throw new Error('npm pack returned no package metadata');
}

const errors: string[] = [];

if (result.unpackedSize > maxUnpackedBytes) {
  errors.push(
    `package unpacked size ${formatBytes(result.unpackedSize)} exceeds limit ${formatBytes(maxUnpackedBytes)}`
  );
}

const packagePaths = new Set(result.files.map((file) => file.path));
for (const requiredPath of REQUIRED_RUNTIME_PATHS) {
  if (!packagePaths.has(requiredPath)) {
    errors.push(`package is missing required runtime entry ${requiredPath}`);
  }
}

for (const forbiddenPath of FORBIDDEN_LOCALNET_ENGINE_PATHS) {
  if (packagePaths.has(forbiddenPath)) {
    errors.push(`${forbiddenPath}: LocalNet engine must not ship in the SDK (use @fairmint/canton-dev-tools)`);
  }
}

for (const file of result.files) {
  const reason = forbiddenPackagePathReason(file.path);
  if (reason) {
    errors.push(`${file.path}: ${reason}`);
  }
}

/** Modules `entry` requires (directly or through its relative files) when loaded in a fresh Node process. */
function requiresWhileLoading(entry: string): string[] {
  const script = `
    const Module = require('module');
    const seen = [];
    const load = Module._load;
    Module._load = function (request, parent, isMain) {
      if (!parent || parent.id === '[eval]') return load.apply(this, arguments);
      seen.push(request);
      // A package is reported, not loaded: its own files are not the SDK's to check, and an emit outside the
      // checkout cannot resolve it.
      if (!request.startsWith('./') && !request.startsWith('../')) return {};
      return load.apply(this, arguments);
    };
    require(${JSON.stringify(path.resolve(entry))});
    process.stdout.write(JSON.stringify(seen));
  `;
  const loaded = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8' });
  throwIfSpawnFailed(`node -e require(${entry})`, loaded);
  return JSON.parse(loaded.stdout) as string[];
}

for (const { entry, packages } of BROWSER_SAFE_ENTRIES) {
  for (const request of requiresWhileLoading(entry)) {
    if (!request.startsWith('./') && !request.startsWith('../') && !packages.includes(request)) {
      errors.push(`${entry}: requires ${request}; this entry must stay browser-safe`);
    }
  }
}

/** The public entry points, each resolved by Node through the `exports` map from a package that depends on this one. */
const RESOLVED_SUBPATHS: ReadonlyArray<readonly [subpath: string, file: string]> = [
  ['', 'build/src/index.js'],
  ['/wallets', 'build/src/wallets/index.js'],
  ['/external-parties', 'build/src/external-parties/index.js'],
  ['/package.json', 'package.json'],
];

/**
 * Former deep paths (written with `.js`, without it, and as a directory) that consumers once imported. The `exports`
 * map no longer exports any `build/...` path, so Node must refuse each with `ERR_PACKAGE_PATH_NOT_EXPORTED`.
 */
const REFUSED_SUBPATHS: readonly string[] = [
  '/build/src/index.js',
  '/build/src/wallets/index.js',
  '/build/src/core/errors',
  '/build/src/utils/transactions',
  '/build/src/clients/ledger-json-api/operations',
  '/build/src/clients/ledger-json-api/operations/v2/updates/subscribe-to-raw-updates.js',
];

/** How Node resolves a subpath of this package for a consumer: a file relative to the package root, or an error code. */
type Resolution = { readonly file: string } | { readonly code: string };

/** Where Node resolves each subpath of this package for a consumer. */
function resolveAsConsumer(packageName: string, subpaths: readonly string[]): Resolution[] {
  const consumer = mkdtempSync(path.join(os.tmpdir(), 'sdk-exports-'));
  try {
    const scope = path.join(consumer, 'node_modules', ...packageName.split('/').slice(0, -1));
    mkdirSync(scope, { recursive: true });
    symlinkSync(process.cwd(), path.join(consumer, 'node_modules', packageName), 'dir');
    const script = `
      const path = require('path');
      const out = ${JSON.stringify(subpaths)}.map((subpath) => {
        try { return { file: path.relative(${JSON.stringify(process.cwd())}, require.resolve(${JSON.stringify(packageName)} + subpath)) }; }
        catch (error) { return { code: String(error && error.code) }; }
      });
      process.stdout.write(JSON.stringify(out));
    `;
    const resolved = spawnSync(process.execPath, ['-e', script], { cwd: consumer, encoding: 'utf8' });
    throwIfSpawnFailed('node -e require.resolve(exports)', resolved);
    return JSON.parse(resolved.stdout) as Resolution[];
  } finally {
    rmSync(consumer, { recursive: true, force: true });
  }
}

const exportsMap = (JSON.parse(readFileSync('package.json', 'utf8')) as { exports?: Record<string, unknown> }).exports;
for (const [subpath, target] of Object.entries(exportsMap ?? {})) {
  const targets = typeof target === 'string' ? [target] : Object.values(target as Record<string, string>);
  for (const file of targets.filter((t) => !t.includes('*')).map((t) => t.replace(/^\.\//, ''))) {
    if (!packagePaths.has(file)) errors.push(`exports ${subpath}: ${file} is not in the package`);
  }
}
const resolutions = resolveAsConsumer(result.name, [
  ...RESOLVED_SUBPATHS.map(([subpath]) => subpath),
  ...REFUSED_SUBPATHS,
]);
const describeResolution = (resolution: Resolution | undefined): string =>
  resolution === undefined ? 'nothing' : 'file' in resolution ? resolution.file : `an error (${resolution.code})`;
RESOLVED_SUBPATHS.forEach(([subpath, file], index) => {
  const resolution = resolutions[index];
  if (resolution === undefined || !('file' in resolution) || resolution.file !== file) {
    errors.push(`${result.name}${subpath} resolves to ${describeResolution(resolution)}, not ${file}`);
  }
});
REFUSED_SUBPATHS.forEach((subpath, index) => {
  const resolution = resolutions[RESOLVED_SUBPATHS.length + index];
  if (resolution === undefined || !('code' in resolution) || resolution.code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED') {
    errors.push(
      `${result.name}${subpath} resolves to ${describeResolution(resolution)}; deep build/ paths must not be exported`
    );
  }
});

if (errors.length > 0) {
  console.error(`\n${result.name}@${result.version} package artifact check failed:\n`);
  for (const error of errors) {
    console.error(`  ✗ ${error}`);
  }
  process.exit(1);
}

console.log(
  `✓ ${result.name}@${result.version} package artifact is ${formatBytes(result.unpackedSize)} unpacked across ${result.files.length} files`
);
console.log('✓ LocalNet engine excluded (owned by @fairmint/canton-dev-tools)');
for (const { entry, packages } of BROWSER_SAFE_ENTRIES) {
  console.log(`✓ ${entry} requires only relative SDK files${packages.length > 0 ? ` and ${packages.join(', ')}` : ''}`);
}
console.log(`✓ every exports target ships, and the ${RESOLVED_SUBPATHS.length} public entry points resolve through it`);
console.log(`✓ ${REFUSED_SUBPATHS.length} former deep build/ paths are refused (ERR_PACKAGE_PATH_NOT_EXPORTED)`);
