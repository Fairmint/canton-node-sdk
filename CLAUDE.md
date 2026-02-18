# Canton Node SDK (`@fairmint/canton-node-sdk`)

> Low-level TypeScript SDK for interacting with Canton blockchain nodes.

## Shared Conventions

See
[canton/AGENTS.md](https://github.com/fairmint/canton/blob/main/AGENTS.md#shared-conventions-all-fairmint-repos)
for PR workflow, git workflow, dependencies, non-negotiables, and Linear integration.

## Linear API Access

Use `LINEAR_API_KEY` for programmatic Linear access. See `linear-api` skill for curl examples.

## Task Management

Task files track multi-step work in `tasks/YYYY/MM/XX/YYYY.MM.DD-description.md`.

**When working on tasks:**

- Update task status (Planning → Implementing → Testing → Completed) as work progresses
- Update `tasks/README.md` index when task status changes
- Mark completed tasks as Completed in both the task file header and README index

See `tasks/README.md` for current task index.

## Quick Commands

```bash
npm run lint && npm run build && npm test   # After any change
npm run build:core                          # Generate + compile only
npm run test:watch                          # Dev mode
```

## Architecture

### Client Hierarchy

```
BaseClient (OAuth2 auth)         SimpleBaseClient (no auth)
     │                                   │
     ├── LedgerJsonApiClient            └── LighthouseClient
     ├── ValidatorApiClient
     └── ScanApiClient
```

### Operation Pattern

Use factory functions for most operations:

```typescript
// REST operations - use createApiOperation
export const GetVersion = createApiOperation<void, GetVersionResponse>({
  paramsSchema: z.void(),
  method: 'GET',
  buildUrl: (_params, apiUrl) => `${apiUrl}/v2/version`,
});

// WebSocket operations - use createWebSocketOperation
export const SubscribeToCompletions = createWebSocketOperation<Params, Request, Message>({
  paramsSchema: CompletionStreamRequestSchema,
  buildPath: (_params, _apiUrl) => '/v2/commands/completions',
  buildRequestMessage: (params, client) => ({
    /* ... */
  }),
});
```

Use classes for complex operations needing async pre-processing or state management:

```typescript
// Class pattern for operations with async defaults
export class GetMemberTrafficStatus extends ApiOperation<Params, Response> {
  async execute(params: Params): Promise<Response> {
    const domainId = params.domainId ?? (await getCurrentMiningRoundDomainId(this.client));
    // ...
  }
}
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed pattern guidelines.

### Configuration

Environment variables follow: `CANTON_{NETWORK}_{PROVIDER}_{SETTING}`

```
CANTON_DEVNET_5N_LEDGER_JSON_API_URI=https://...
CANTON_DEVNET_5N_LEDGER_JSON_API_CLIENT_ID=...
CANTON_DEVNET_5N_LEDGER_JSON_API_CLIENT_SECRET=...
```

Use `EnvLoader.getConfig()` to load programmatically.

## File Structure

```
src/
├── clients/
│   ├── register.ts           # All client exports
│   ├── ledger-json-api/      # Ledger JSON API client
│   │   ├── LedgerJsonApiClient.ts
│   │   ├── operations/       # One class per endpoint
│   │   └── schemas/          # Zod schemas, generated types
│   ├── validator-api/        # Validator API client
│   └── scan-api/             # Scan API client
├── utils/                    # Utility functions (createParty, etc.)
├── auth/                     # AuthenticationManager (OAuth2)
└── errors/                   # Custom error classes
```

## Adding a New API Client

1. Add OpenAPI spec to `specs/`
2. Run `npm run generate:openapi`
3. Create client class extending `BaseClient` or `SimpleBaseClient`
4. Implement operations in `operations/`
5. Export from `src/clients/register.ts`

## Adding a New Operation

1. Create class in `src/clients/{api}/operations/`
2. Extend `ApiOperation` or `SimpleApiOperation`
3. Define `path`, `method`, request/response schemas
4. Add to client class and export

## Error Hierarchy

```typescript
CantonError                 // Base
├── ConfigurationError      // Missing/invalid config
├── AuthenticationError     // OAuth2 failures
├── ApiError               // HTTP errors
├── ValidationError        // Schema validation
└── NetworkError           // Connection issues
```

## External Signing

For user-controlled private keys (wallets):

1. Generate keypair (`@stellar/stellar-base`)
2. `createExternalParty()` - Onboard party
3. `prepareExternalTransaction()` - Get hash to sign
4. Sign with private key
5. `executeExternalTransaction()` - Submit

See [docs/EXTERNAL_SIGNING.md](docs/EXTERNAL_SIGNING.md) for details.

## TypeScript Strictness

- `noImplicitAny`, `noImplicitReturns`, `exactOptionalPropertyTypes`
- Always provide explicit return types
- Never use `any`

## Testing

- Unit tests in `test/unit/`
- Integration tests require LocalNet (see below)
- Run specific test: `npm test path/to/test.spec.ts`

## LocalNet (cn-quickstart)

Git submodule for local Canton Network development and testing.

```bash
# Quick start
git submodule update --init --recursive
cd libs/cn-quickstart/quickstart
make setup && make start

# Wait for healthy, then run tests
docker ps --format "table {{.Names}}\t{{.Status}}"
```

For detailed setup, ports, OAuth2 credentials, and troubleshooting, use the `localnet` skill.

## NPM Publishing

The package `@fairmint/canton-node-sdk` is automatically published to NPM when changes are merged to
`main`.

### How It Works

1. **Create a PR** with your changes
2. **Monitor CI status** (see below)
3. **Open the PR** in browser for review: `open <PR_URL>`
4. **Get it reviewed** and approved
5. **Merge to main** - CI automatically:
   - Builds the package
   - Increments the patch version in `package.json`
   - Generates a changelog from commits since last release
   - Publishes to NPM
   - Creates and pushes a git tag (e.g., `v0.0.128`)
   - Deploys documentation to GitHub Pages

### Version Bumping

- **Patch bumps** (0.0.127 → 0.0.128): Automatic on every merge to main
- **Minor/Major bumps**: Manually update `package.json` version before merging

### Manual Release (Local)

```bash
npm run prepare-release   # Bumps version, generates changelog
npm publish               # Publishes to NPM (requires NPM_TOKEN)
```

### CI Requirements

The publish workflow requires:

- `NPM_TOKEN` secret configured in GitHub repository settings

---

## Living Document

**Keep this file up-to-date.** Update it when:

- A best practice or pattern is established
- An architectural or coding decision is made
- New features, endpoints, or patterns are added
- Before creating a PR: review for generalizable learnings

---

## Communication Style

Be concise in all communications:

- **PR reviews**: Lead with issues, collapse detailed analysis in `<details>`
- **Commits**: One-line summary, optional bullet points for details
- **PR descriptions**: Brief summary, link to task file for context
- **Comments**: Direct and actionable, skip pleasantries

Include all necessary information, but keep it brief and scannable.

---

## Git Hooks

Before committing or pushing, run these checks:

| Step  | Command         | Purpose                |
| ----- | --------------- | ---------------------- |
| Lint  | `npm run fix`   | Fix linting/formatting |
| Test  | `npm test`      | Ensure tests pass      |
| Build | `npm run build` | Verify compilation     |

**Note**: Husky hooks should enforce this automatically. If hooks aren't set up, run these manually.

---

## Related Repos

| Repo                          | Purpose                                       | Docs                                                                     |
| ----------------------------- | --------------------------------------------- | ------------------------------------------------------------------------ |
| `canton`                      | Trading infrastructure, ADRs                  | `AGENTS.md`                                                              |
| `canton-explorer`             | Next.js explorer UI                           | `AGENTS.md`, [cantonops.fairmint.com](https://cantonops.fairmint.com/)   |
| `canton-fairmint-sdk`         | Shared TypeScript utilities                   | `AGENTS.md`                                                              |
| `ocp-canton-sdk`              | High-level OCP TypeScript SDK                 | `AGENTS.md`, [ocp.canton.fairmint.com](https://ocp.canton.fairmint.com/) |
| `ocp-equity-certificate`      | Soulbound equity certificate smart contracts  | `AGENTS.md`                                                              |
| `open-captable-protocol-daml` | DAML contracts (OCF impl)                     | `AGENTS.md`                                                              |

## Docs

- End-user docs: [sdk.canton.fairmint.com](https://sdk.canton.fairmint.com/)
- API reference: `docs/` (Jekyll site)
- External signing: [docs/EXTERNAL_SIGNING.md](docs/EXTERNAL_SIGNING.md)
