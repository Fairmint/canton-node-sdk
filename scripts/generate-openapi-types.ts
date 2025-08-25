#!/usr/bin/env tsx

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { glob } from 'glob';

function ensureDirectoryExists(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function generateForFile(yamlPath: string): void {
  const relativePath = yamlPath
    .replace(/^artifacts\/splice\//, '')
    .replace(/\.yaml$/, '.ts');
  const outputPath = path.join('src/generated', relativePath);
  ensureDirectoryExists(outputPath);
  console.log(`🧬 Generating types for ${yamlPath} -> ${outputPath}`);
  execSync(`npx openapi-typescript "${yamlPath}" -o "${outputPath}"`, {
    stdio: 'inherit',
  });
}

function main(): void {
  console.log('🔎 Scanning for OpenAPI YAML files...');
  const openapiUnderDir = glob.sync('artifacts/splice/**/openapi/**/*.yaml', {
    nodir: true,
  });
  const openapiRootFiles = glob.sync('artifacts/splice/**/openapi.yaml', {
    nodir: true,
  });

  // Merge and de-duplicate
  const allFiles = Array.from(
    new Set([...openapiUnderDir, ...openapiRootFiles])
  );

  if (allFiles.length === 0) {
    console.log('⚠️  No OpenAPI files found.');
    return;
  }

  // Generate types sequentially for clearer logs
  for (const file of allFiles) {
    generateForFile(file);
  }

  console.log('✅ OpenAPI type generation complete.');
}

main();
