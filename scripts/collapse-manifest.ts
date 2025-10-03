#!/usr/bin/env tsx

/**
 * Collapse TypeScript manifest by removing mapping files and collapsing extensions
 *
 * This script reads file paths from stdin and outputs a simplified manifest that removes .d.ts.map and .js.map files
 * and collapses .d.ts and .js files into single entries without extensions.
 */

import { readFileSync } from 'fs';

function collapseManifest(): void {
  try {
    // Read all lines from stdin
    const input = readFileSync(0, 'utf-8');

    const lines = input
      .trim()
      .split('\n')
      .filter((line) => line.length > 0);

    // Exit with error if no files found
    if (lines.length === 0) {
      console.error('ERROR: No files found for manifest generation');
      process.exit(1);
    }

    // Track files to exclude (mapping files)
    const filesToExclude = new Set<string>();
    const filesToKeep = new Set<string>();
    const collapsedFiles = new Set<string>();

    // First pass: identify mapping files and their corresponding main files
    for (const line of lines) {
      if (line.endsWith('.d.ts.map') || line.endsWith('.js.map')) {
        filesToExclude.add(line);
      } else {
        filesToKeep.add(line);
      }
    }

    // Second pass: collapse .d.ts and .js files into single entries
    for (const file of filesToKeep) {
      if (file.endsWith('.d.ts') || file.endsWith('.js')) {
        // Remove the extension to get the base name
        const baseName = file.replace(/\.(d\.ts|js)$/, '');
        collapsedFiles.add(baseName);
      } else {
        // Keep non-TypeScript/JavaScript files as-is
        collapsedFiles.add(file);
      }
    }

    // Output the collapsed files in sorted order
    const sortedFiles = Array.from(collapsedFiles).sort();

    for (const file of sortedFiles) {
      console.log(file);
    }
  } catch (error) {
    console.error('Error processing manifest:', error);
    process.exit(1);
  }
}

// Run the script
collapseManifest();
