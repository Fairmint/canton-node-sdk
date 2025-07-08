# Scripts

Utility scripts for the canton-node-sdk project.

## prepare-release.js

Prepares a new release by incrementing version and generating changelog.

```bash
npm run prepare-release
```

- Increments patch version in `package.json`
- Creates changelog from commits since last tag
- Links commits to GitHub PRs
- Safe for local testing (no git operations)
- Saves changelog to `CHANGELOG.md`
