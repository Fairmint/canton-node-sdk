#!/usr/bin/env tsx

import * as fs from 'fs';
import * as path from 'path';

async function updateDocsVersion(): Promise<void> {
  console.log('🔄 Updating documentation version...');

  // Read SDK version from package.json
  const packageJsonPath = path.join(process.cwd(), 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
  const sdkVersion = packageJson.version;

  console.log(`📦 SDK Version: ${sdkVersion}`);

  // List of documentation files to update
  const docsFiles = [
    'docs/index.md',
    'docs/getting-started.md',
    'docs/features.md',
    'docs/configuration.md',
    'docs/error-handling.md',
  ];

  for (const filePath of docsFiles) {
    if (fs.existsSync(filePath)) {
      await updateFileVersion(filePath, sdkVersion);
    }
  }

  console.log('✅ Documentation version update complete!');
}

async function updateFileVersion(
  filePath: string,
  version: string
): Promise<void> {
  const content = fs.readFileSync(filePath, 'utf-8');

  // Check if file already has sdk_version in front matter
  if (content.includes('sdk_version:')) {
    // Update existing sdk_version
    const updatedContent = content.replace(
      /sdk_version:\s*[\d.]+/,
      `sdk_version: ${version}`
    );
    fs.writeFileSync(filePath, updatedContent);
    console.log(`📄 Updated version in: ${filePath}`);
  } else {
    // Add sdk_version to front matter
    const updatedContent = content.replace(
      /^---\s*\n/,
      `---\nsdk_version: ${version}\n`
    );
    fs.writeFileSync(filePath, updatedContent);
    console.log(`📄 Added version to: ${filePath}`);
  }
}

// Run the updater
async function main(): Promise<void> {
  try {
    await updateDocsVersion();
  } catch (error) {
    console.error('❌ Error updating documentation version:', error);
    process.exit(1);
  }
}

main();
