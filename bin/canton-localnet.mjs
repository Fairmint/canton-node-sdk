#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const thisFile = fileURLToPath(import.meta.url);
const packageRoot = path.resolve(path.dirname(thisFile), '..');
const localnetScript = path.join(packageRoot, 'scripts', 'localnet-cloud.sh');
const args = process.argv.slice(2);

const result = spawnSync('bash', [localnetScript, ...args], {
  cwd: process.cwd(),
  stdio: 'inherit',
});

if (result.error) {
  console.error(`[canton-localnet] Failed to run ${localnetScript}:`, result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
