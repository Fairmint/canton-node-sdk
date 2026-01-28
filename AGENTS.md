# Canton Node SDK (`@fairmint/canton-node-sdk`)

> Low-level TypeScript SDK for interacting with Canton blockchain nodes.

## Shared Conventions

See [canton/AGENTS.md](https://github.com/fairmint/canton/blob/main/AGENTS.md#shared-conventions-all-fairmint-repos) for PR workflow, git workflow, dependencies, non-negotiables, and Linear integration.

## Linear API Access

The `LINEAR_API_KEY` environment variable provides access to the [Linear](https://linear.app/fairmint) GraphQL API for issue tracking.

```bash
curl -s -X POST https://api.linear.app/graphql \
  -H "Authorization: $LINEAR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "{ issue(id: \"ENG-XXX\") { title state { name } } }"}'
```

See [canton/AGENTS.md](https://github.com/fairmint/canton/blob/main/AGENTS.md#linear-integration) for full workflow documentation.

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
  buildRequestMessage: (params, client) => ({ /* ... */ }),
});
```

Use classes for complex operations needing async pre-processing or state management:

```typescript
// Class pattern for operations with async defaults
export class GetMemberTrafficStatus extends ApiOperation<Params, Response> {
  async execute(params: Params): Promise<Response> {
    const domainId = params.domainId ?? await getCurrentMiningRoundDomainId(this.client);
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

The SDK includes cn-quickstart as a git submodule for local development and testing against a real Canton Network.

### Location

```
libs/cn-quickstart/quickstart/   # cn-quickstart directory
```

### Prerequisites

- **Docker Desktop** running with at least 8GB RAM allocated
- **DAML SDK** (installed via `make install-daml-sdk`)

### First-Time Setup

```bash
# Initialize submodule (if not already done)
git submodule update --init --recursive

# Navigate to cn-quickstart
cd libs/cn-quickstart/quickstart

# Run interactive setup (creates .env.local)
make setup
# Choose: OAuth2 mode or shared-secret mode
# Set party hint (e.g., "quickstart-dev-1")

# Install DAML SDK (if not already installed)
make install-daml-sdk
```

### Starting LocalNet

```bash
cd libs/cn-quickstart/quickstart
make start   # Builds and starts all containers (~4-5 min first time)
```

Wait for all services to become healthy:

```bash
docker ps --format "table {{.Names}}\t{{.Status}}"
# All services should show "healthy" before running tests
```

### Stopping LocalNet

```bash
cd libs/cn-quickstart/quickstart
make stop              # Stop all containers
make clean-all-docker  # Full reset (removes all containers/volumes)
```

### LocalNet Services and Ports

| Service | Port | Description |
|---------|------|-------------|
| App-Provider JSON API | 3975 | Ledger API for app_provider participant |
| App-Provider Validator | 3903 | Validator API for app_provider |
| App-User JSON API | 2975 | Ledger API for app_user participant |
| SV JSON API | 4975 | Ledger API for super validator |
| Keycloak | 8082 | OAuth2 authentication |
| Scan API | scan.localhost:4000 | Network-wide contract queries |
| Swagger UI | 9090 | API documentation |
| Grafana | 3030 | Observability dashboard |

### OAuth2 Credentials (app-provider)

Default LocalNet OAuth2 credentials:

```
Auth URL: http://localhost:8082/realms/AppProvider/protocol/openid-connect/token
Client ID: app-provider-validator
Client Secret: AL8648b9SfdTFImq7FV56Vd0KHifHBuC
```

### Troubleshooting

#### "Cannot connect to Docker daemon"
```bash
# Start Docker Desktop, then verify
docker ps
```

#### "HTTP 503" or "Connection refused"
Services aren't ready yet. Wait for all containers to show "healthy":
```bash
docker ps --format "table {{.Names}}\t{{.Status}}" | grep -v healthy
# Should return nothing when ready
```

#### "Container keeps restarting"
Reset everything:
```bash
cd libs/cn-quickstart/quickstart
make clean-all-docker  # Remove all containers and volumes
make start
```

#### "Port already in use"
```bash
make stop              # Stop LocalNet containers
lsof -i :3975          # Find what's using JSON API port
```

### Useful Make Targets

```bash
make status            # Show container status
make logs              # View all logs
make tail              # Tail logs in real-time
make restart           # Stop and start
make canton-console    # Interactive Canton console
```

### Known Limitations

1. **First-time startup**: Takes longer as it builds images and compiles DAML code
2. **Resource usage**: Runs ~20+ containers, requires 8GB+ RAM for Docker
3. **State persistence**: Canton restarts clear all ledger state (DARs, contracts)

## NPM Publishing

The package `@fairmint/canton-node-sdk` is automatically published to NPM when changes are merged to `main`.

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

## PR Review Format

When writing PR reviews, use this format:

1. **Issues and improvements first** — Call out any problems, bugs, or suggested improvements at the
   top, outside any collapsed sections. This is the only feedback reviewers need to see immediately.
   - **Issue**: Something that should be fixed — bugs, security problems, incorrect logic,
     violations of project standards
   - **Improvement**: Something that could be better — performance, readability, maintainability,
     edge cases

2. **Collapse the rest** — Put the full analysis and any positive remarks inside a collapsed
   `<details>` section:

```markdown
## Issues

- **File:Line** Description of issue or improvement

---

<details>
<summary>Full Analysis</summary>

... detailed analysis, positive remarks, etc. ...

</details>
```

Keep the visible portion brief and actionable. The collapsed section is for comprehensive details
and rationale.

---

## Related Repos

| Repo | Purpose | Docs |
|------|---------|------|
| `canton` | Trading infrastructure, ADRs | `AGENTS.md` |
| `canton-explorer` | Next.js explorer UI | `AGENTS.md`, [cantonops.fairmint.com](https://cantonops.fairmint.com/) |
| `canton-fairmint-sdk` | Shared TypeScript utilities | `AGENTS.md` |
| `ocp-canton-sdk` | High-level OCP TypeScript SDK | `AGENTS.md`, [ocp.canton.fairmint.com](https://ocp.canton.fairmint.com/) |
| `ocp-position-nft` | Soulbound NFT smart contracts | `AGENTS.md` |
| `open-captable-protocol-daml` | DAML contracts (OCF impl) | `AGENTS.md` |

## Docs

- End-user docs: [sdk.canton.fairmint.com](https://sdk.canton.fairmint.com/)
- API reference: `docs/` (Jekyll site)
- External signing: [docs/EXTERNAL_SIGNING.md](docs/EXTERNAL_SIGNING.md)
