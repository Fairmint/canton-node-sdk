#!/usr/bin/env tsx

import { spawnSync } from 'child_process';

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
const maxUnpackedBytes = Number.parseInt(configuredMaxUnpackedBytes ?? String(DEFAULT_MAX_UNPACKED_BYTES), 10);

function formatBytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
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

const pack = spawnSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
  encoding: 'utf8',
});

if (pack.status !== 0) {
  console.error(pack.stderr || pack.stdout);
  throw new Error(`npm pack failed with status ${pack.status ?? 'unknown'}`);
}

const [result] = parsePackResults(pack.stdout);
if (!result) {
  throw new Error('npm pack returned no package metadata');
}

const errors: string[] = [];

if (Number.isNaN(maxUnpackedBytes) || maxUnpackedBytes <= 0) {
  errors.push(
    `MAX_PACKAGE_UNPACKED_BYTES must be a positive integer, got ${JSON.stringify(configuredMaxUnpackedBytes)}`
  );
} else if (result.unpackedSize > maxUnpackedBytes) {
  errors.push(
    `package unpacked size ${formatBytes(result.unpackedSize)} exceeds limit ${formatBytes(maxUnpackedBytes)}`
  );
}

const packagePaths = new Set(result.files.map((file) => file.path));
for (const requiredPath of ['build/src/index.js', 'build/src/index.d.ts']) {
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
