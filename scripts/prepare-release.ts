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
 * - Checks both npm registry and git tags to determine next version
 * - Creates changelog from commits since last tag
 * - Links commits to GitHub PRs
 * - Safe for local testing (no git operations)
 * - Saves changelog to CHANGELOG.md
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

interface PackageJson {
  name: string;
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

/** Get the latest version from npm registry */
function getNpmLatestVersion(packageName: string): string | null {
  try {
    const version = execSync(`npm view ${packageName} version 2>/dev/null`, {
      encoding: 'utf8',
    }).trim();
    return version || null;
  } catch {
    return null;
  }
}

/** Check if a version exists on npm registry */
function npmVersionExists(packageName: string, version: string): boolean {
  try {
    const versions = execSync(`npm view ${packageName} versions --json 2>/dev/null`, {
      encoding: 'utf8',
    });
    const versionList: string[] = JSON.parse(versions);
    return versionList.includes(version);
  } catch {
    return false;
  }
}

/** Parse version string into components */
function parseVersion(version: string): { major: number; minor: number; patch: number } | null {
  const parts = version.split('.').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) {
    return null;
  }
  return { major: parts[0]!, minor: parts[1]!, patch: parts[2]! };
}

/** Find the next available version by checking both git tags and npm registry */
function findNextAvailableVersion(
  packageName: string,
  major: number,
  minor: number,
  startPatch: number
): string {
  let patch = startPatch;
  let version: string;

  do {
    patch++;
    version = `${major}.${minor}.${patch}`;
  } while (tagExists(`v${version}`) || npmVersionExists(packageName, version));

  return version;
}

/** Get the highest version from git tags and npm, then find next available */
function determineNextVersion(packageName: string, currentVersion: string): string {
  const current = parseVersion(currentVersion);
  if (!current) {
    throw new Error(`Invalid version format: ${currentVersion}`);
  }

  // Get latest version from npm registry
  const npmVersion = getNpmLatestVersion(packageName);
  const npm = npmVersion ? parseVersion(npmVersion) : null;

  // Get latest version from git tags
  let gitVersion: string | null = null;
  try {
    gitVersion = execSync('git describe --tags --abbrev=0 2>/dev/null', {
      encoding: 'utf8',
    }).trim();
    if (gitVersion.startsWith('v')) {
      gitVersion = gitVersion.slice(1);
    }
  } catch {
    gitVersion = null;
  }
  const git = gitVersion ? parseVersion(gitVersion) : null;

  // Determine the highest patch version among current, npm, and git
  let highestPatch = current.patch;

  if (npm?.major === current.major && npm.minor === current.minor) {
    highestPatch = Math.max(highestPatch, npm.patch);
  }

  if (git?.major === current.major && git.minor === current.minor) {
    highestPatch = Math.max(highestPatch, git.patch);
  }

  console.log(`Current version: ${currentVersion}`);
  console.log(`NPM latest version: ${npmVersion ?? 'not found'}`);
  console.log(`Git latest tag: ${gitVersion ? `v${gitVersion}` : 'not found'}`);
  console.log(`Highest patch in ${current.major}.${current.minor}.x: ${highestPatch}`);

  // Find next available version starting from the highest
  return findNextAvailableVersion(packageName, current.major, current.minor, highestPatch);
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
    const packageName: string = packageJson.name;

    // Find next available version by checking both npm and git tags
    const newVersion: string = determineNextVersion(packageName, currentVersion);

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
    const _tagMessage = `Release v${newVersion}\n\nChanges:\n${changelog}`;

    console.log('Release tag prepared:', _tagMessage);

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

    console.log('Changelog updated successfully');
    console.log('Release preparation complete');
  } catch (_error) {
    console.error('Error preparing release:', _error);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  prepareRelease();
}

export { prepareRelease };
