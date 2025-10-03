#!/usr/bin/env node

/**
 * Prepare Release Script
 *
 * Prepares a new release by incrementing version and generating changelog.
 *
 * Usage: npm run prepare-release
 *
 * Features:
 *
 * - Increments patch version in package.json
 * - Creates changelog from commits since last tag
 * - Links commits to GitHub PRs
 * - Safe for local testing (no git operations)
 * - Saves changelog to CHANGELOG.md
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

interface PackageJson {
  version: string;
  [key: string]: unknown;
}

/** Check if a git tag exists */
function tagExists(tag: string): boolean {
  try {
    execSync(`git rev-parse "refs/tags/${tag}"`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** Find the next available version by incrementing patch until we find one that doesn't exist */
function findNextAvailableVersion(major: number, minor: number, startPatch: number): string {
  let patch = startPatch;
  let version: string;

  do {
    patch++;
    version = `${major}.${minor}.${patch}`;
  } while (tagExists(`v${version}`));

  return version;
}

/**
 * Prepare release by incrementing version and generating changelog This script can be run locally to test the release
 * process
 */
function prepareRelease(): void {
  try {
    // Read package.json
    const packageJsonPath: string = path.join(process.cwd(), 'package.json');
    const packageJson: PackageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

    const currentVersion: string = packageJson.version;
    

    // Extract major, minor, patch
    const versionParts: number[] = currentVersion.split('.').map(Number);

    if (versionParts.length !== 3) {
      throw new Error('Invalid version format. Expected format: x.y.z');
    }

    const major: number = versionParts[0]!;
    const minor: number = versionParts[1]!;
    const patch: number = versionParts[2]!;

    // Find next available version (increment patch until we find one that doesn't exist)
    const newVersion: string = findNextAvailableVersion(major, minor, patch);

    

    // Update version in package.json (without git tag)
    packageJson.version = newVersion;
    fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);

    

    // Generate changelog since last tag or main branch
    let commits: string;
    let lastTag: string | null = null;
    try {
      lastTag = execSync('git describe --tags --abbrev=0 2>/dev/null', {
        encoding: 'utf8',
      }).trim();
      
      commits = execSync(`git log --oneline --format="%s" ${lastTag}..HEAD`, {
        encoding: 'utf8',
      }).trim();
    } catch {
      // No previous tag, get commits ahead of main branch
      
      commits = execSync('git log --oneline --format="%s" main..HEAD', {
        encoding: 'utf8',
      }).trim();
    }

    if (!commits) {
      
      return;
    }

    // Extract PR numbers and create changelog
    const commitLines: string[] = commits.split('\n').map((commit: string): string => `- ${commit}`);

    const changelog: string = commitLines.join('\n');

    
    
    
    

    // Create detailed tag message
    const tagMessage = `Release v${newVersion}\n\nChanges:\n${changelog}`;

    
    
    
    

    // Save changelog to file for reference
    const changelogPath: string = path.join(process.cwd(), 'CHANGELOG.md');

    // Add previous version link if available
    const previousVersionLink: string = lastTag
      ? `\n[Previous version: ${lastTag}](https://github.com/Fairmint/canton-node-sdk/releases/tag/${lastTag})`
      : '';

    const changelogContent = `# Changelog for v${newVersion}\n\n${changelog}${previousVersionLink}\n\n`;

    // Prepend to existing changelog if it exists
    if (fs.existsSync(changelogPath)) {
      const existingChangelog: string = fs.readFileSync(changelogPath, 'utf8');
      fs.writeFileSync(changelogPath, changelogContent + existingChangelog);
    } else {
      fs.writeFileSync(changelogPath, changelogContent);
    }

    
    
    
    
    
    
  } catch (error) {
    
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  prepareRelease();
}

export { prepareRelease };
