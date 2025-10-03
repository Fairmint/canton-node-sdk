#!/usr/bin/env tsx

import * as fs from 'fs';
import * as path from 'path';

async function updateDocsVersion(): Promise<void> {
  

  // Read SDK version from package.json
  const packageJsonPath = path.join(process.cwd(), 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
  const sdkVersion = packageJson.version;

  

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

  
}

async function updateFileVersion(filePath: string, version: string): Promise<void> {
  const content = fs.readFileSync(filePath, 'utf-8');

  // Check if file already has sdk_version in front matter
  if (content.includes('sdk_version:')) {
    // Update existing sdk_version
    const updatedContent = content.replace(/sdk_version:\s*[\d.]+/, `sdk_version: ${version}`);
    fs.writeFileSync(filePath, updatedContent);
    
  } else {
    // Add sdk_version to front matter
    const updatedContent = content.replace(/^---\s*\n/, `---\nsdk_version: ${version}\n`);
    fs.writeFileSync(filePath, updatedContent);
    
  }
}

// Run the updater
async function main(): Promise<void> {
  try {
    await updateDocsVersion();
  } catch (error) {
    
    process.exit(1);
  }
}

main();
