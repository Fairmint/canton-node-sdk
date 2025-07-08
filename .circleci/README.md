# CircleCI Auto-Fix Setup

This CircleCI workflow automatically fixes lint and format issues in your code.

## How It Works

1. Runs `npm run lint` and `npm run format` with autofix
2. If files were modified:
   - Commits changes with "Auto-fix: lint and format changes"
   - Pushes to the branch
   - **Fails the original build** (indicating fixes were applied)
   - A new CircleCI build is triggered, and should succeed
3. If no changes, build succeeds

## Setup Required

### 1. GitHub Token

Create a Personal Access Token with the following permissions:

**For Fine-grained tokens:**

- **Repository permissions:**
  - `Contents`: Read and write access (to push commits)
  - `Metadata`: Read-only access (to access repository information)

**For Classic tokens:**

- `repo` scope (full repository access) - OR -
- `public_repo` scope (if this is a public repository)

- Go to [GitHub Personal Access Tokens](https://github.com/settings/tokens) settings
- Click "Generate new token" and select "Fine-grained tokens"
- Configure token with the required repository permissions listed above

### 2. CircleCI Environment Variable

Add `GITHUB_TOKEN` environment variable in your CircleCI project settings

- Navigate to CircleCI Project Settings
- Go to Environment Variables section and add new variable named `GITHUB_TOKEN` with your GitHub
  token
