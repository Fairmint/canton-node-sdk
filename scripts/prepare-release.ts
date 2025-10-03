#!/usr/bin/env node

/**
 * Prepare Release Script
 *
 * Prepares a new release by incrementing version and generating changelog.
 *
 * Usage:
 *   npm run prepare-release
 *
 * Features:
 * - Increments patch version in package.json
 * - Creates changelog from commits since last tag
 * - Links commits to GitHub PRs
 * - Safe for local testing (no git operations)
 * - Saves changelog to CHANGELOG.md
 */

import fs from 'fs';
import { execSync } from 'child_process';
import path from 'path';

interface PackageJson {
  version: string;
  [key: string]: unknown;
}

/**
 * Check if a git tag exists
 */
function tagExists(tag: string): boolean {
  try {
    execSync(`git rev-parse "refs/tags/${tag}"`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Find the next available version by incrementing patch until we find one that doesn't exist
 */
function findNextAvailableVersion(
  major: number,
  minor: number,
  startPatch: number
): string {
  let patch = startPatch;
  let version: string;

  do {
    patch++;
    version = `${major}.${minor}.${patch}`;
  } while (tagExists(`v${version}`));

  return version;
}

/**
 * Prepare release by incrementing version and generating changelog
 * This script can be run locally to test the release process
 */
function prepareRelease(): void {
  try {
    // Read package.json
    const packageJsonPath: string = path.join(process.cwd(), 'package.json');
    const packageJson: PackageJson = JSON.parse(
      fs.readFileSync(packageJsonPath, 'utf8')
    );

    const currentVersion: string = packageJson.version;
    console.log(`Current version: ${currentVersion}`);

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

    console.log(`New version: ${newVersion}`);

    // Update version in package.json (without git tag)
    packageJson.version = newVersion;
    fs.writeFileSync(
      packageJsonPath,
      `${JSON.stringify(packageJson, null, 2)  }\n`
    );

    console.log('✅ Updated package.json with new version');

    // Generate changelog since last tag or main branch
    let commits: string;
    let lastTag: string | null = null;
    try {
      lastTag = execSync('git describe --tags --abbrev=0 2>/dev/null', {
        encoding: 'utf8',
      }).trim();
      console.log(`Last tag: ${lastTag}`);
      commits = execSync(`git log --oneline --format="%s" ${lastTag}..HEAD`, {
        encoding: 'utf8',
      }).trim();
    } catch {
      // No previous tag, get commits ahead of main branch
      console.log(
        'No previous tag found, getting commits ahead of main branch'
      );
      commits = execSync('git log --oneline --format="%s" main..HEAD', {
        encoding: 'utf8',
      }).trim();
    }

    if (!commits) {
      console.log('No commits found for changelog');
      return;
    }

    // Extract PR numbers and create changelog
    const commitLines: string[] = commits
      .split('\n')
      .map((commit: string): string => `- ${commit}`);

    const changelog: string = commitLines.join('\n');

    console.log('\n📋 Generated changelog:');
    console.log('='.repeat(50));
    console.log(changelog);
    console.log('='.repeat(50));

    // Create detailed tag message
    const tagMessage = `Release v${newVersion}\n\nChanges:\n${changelog}`;

    console.log('\n🏷️  Tag message preview:');
    console.log('='.repeat(50));
    console.log(tagMessage);
    console.log('='.repeat(50));

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

    console.log(`\n✅ Saved changelog to CHANGELOG.md`);
    console.log(`\n🎯 Ready for release! Next steps:`);
    console.log(`1. Review the changes above`);
    console.log(`2. Run: npm publish (if ready to publish)`);
    console.log(
      `3. Run: git tag -a "v${newVersion}" -m "${tagMessage.replace(/\n/g, '\\n')}"`
    );
    console.log(`4. Run: git push origin "v${newVersion}"`);
  } catch (error) {
    console.error('❌ Error preparing release:', (error as Error).message);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  prepareRelease();
}

export { prepareRelease };
