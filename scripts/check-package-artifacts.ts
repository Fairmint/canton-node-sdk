#!/usr/bin/env tsx

import { spawnSync, type SpawnSyncReturns } from 'child_process';

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
for (const requiredPath of ['build/src/index.js', 'build/src/index.d.ts', 'bin/canton-localnet']) {
  if (!packagePaths.has(requiredPath)) {
    errors.push(`package is missing required runtime entry ${requiredPath}`);
  }
}

for (const file of result.files) {
  const reason = forbiddenPackagePathReason(file.path);
  if (reason) {
    errors.push(`${file.path}: ${reason}`);
  }
}

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
