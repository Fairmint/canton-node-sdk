#!/usr/bin/env node
/**
 * Enforces exact-version pinning for all registry dependencies.
 * Allowed non-registry specs: file:, link:, workspace:, git, github:, http:, https:
 * Fails on: ^, ~, >=, <=, >, <, *, latest, tags, and any semver range.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SECTIONS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];

const NON_REGISTRY_PREFIXES = [
  'file:',
  'link:',
  'workspace:',
  'git+',
  'git://',
  'github:',
  'bitbucket:',
  'gitlab:',
  'http://',
  'https://',
];

function isNonRegistry(version) {
  return NON_REGISTRY_PREFIXES.some((p) => version.startsWith(p));
}

function isExactVersion(version) {
  // Exact semver: digits only with dots, optional leading 'v', no range chars
  return /^v?\d+\.\d+\.\d+([+\-][a-zA-Z0-9._-]+)?$/.test(version);
}

const pkgPath = resolve(process.cwd(), 'package.json');
let pkg;
try {
  pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
} catch (err) {
  console.error(`Error reading ${pkgPath}: ${err.message}`);
  process.exit(1);
}

const violations = [];

for (const section of SECTIONS) {
  const deps = pkg[section];
  if (!deps) continue;
  for (const [name, version] of Object.entries(deps)) {
    if (!version || isNonRegistry(version)) continue;
    if (!isExactVersion(version)) {
      violations.push(`  [${section}] ${name}: "${version}"`);
    }
  }
}

if (violations.length > 0) {
  console.error('Non-pinned registry dependencies found in package.json:');
  violations.forEach((v) => console.error(v));
  console.error(
    '\nAll registry dependencies must use exact versions (e.g. "1.2.3", not "^1.2.3" or "~1.2.3").',
  );
  process.exit(1);
}

console.log(`✓ All registry dependencies in ${pkgPath} are pinned to exact versions.`);
