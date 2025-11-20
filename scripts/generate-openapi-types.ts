#!/usr/bin/env tsx

import { execSync } from 'child_process';
import * as fs from 'fs';
import { glob } from 'glob';
import * as path from 'path';

function ensureDirectoryExists(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function generateForFile(yamlPath: string): void {
  const relativePath = yamlPath.replace(/^libs\/splice\//, '').replace(/\.yaml$/, '.ts');
  const outputPath = path.join('src/generated', relativePath);
  ensureDirectoryExists(outputPath);

  execSync(`npx openapi-typescript "${yamlPath}" -o "${outputPath}"`, {
    stdio: 'inherit',
  });
}

function main(): void {
  const openapiUnderDir = glob.sync('libs/splice/**/openapi/**/*.yaml', {
    nodir: true,
  });
  const openapiRootFiles = glob.sync('libs/splice/**/openapi.yaml', {
    nodir: true,
  });

  // Merge and de-duplicate
  const allFiles = Array.from(new Set([...openapiUnderDir, ...openapiRootFiles]));

  if (allFiles.length === 0) {
    return;
  }

  // Generate types sequentially for clearer logs
  for (const file of allFiles) {
    generateForFile(file);
  }
}

main();
