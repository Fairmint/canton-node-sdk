# Grant User Rights Utility

A command-line script to grant user rights on a specific network and provider.

## Features

- **Network/Provider Configuration**: Target specific network/provider or use current from environment
- **Auto-detect User**: Automatically fetches authenticated user ID if not provided
- **Multiple right types**: Support for admin rights and party-specific rights
- **Verification**: Lists current rights before and after granting

## Usage

### Basic Usage

Grant admin rights to the authenticated user (uses current network/provider from env):

```bash
npm run grant-user-rights -- --admin
```

Grant admin rights to a specific user:

```bash
npm run grant-user-rights -- --user-id "5" --admin
```

### Grant Party-Specific Rights

Grant CanActAs and CanReadAs rights for the authenticated user:

```bash
npm run grant-user-rights -- --party-id "alice::party1"
```

Grant CanActAs and CanReadAs rights for a specific user:

```bash
npm run grant-user-rights -- --user-id "alice" --party-id "alice::party1"
```

### Target Specific Network/Provider

Grant rights on a specific network and provider:

```bash
npm run grant-user-rights -- --admin --network devnet --provider intellect
```

### With Identity Provider

Grant rights with a specific identity provider:

```bash
npm run grant-user-rights -- --user-id "5" --admin --identity-provider "default"
```

## Command Line Options

| Option | Description | Required |
|--------|-------------|----------|
| `--user-id <id>` | User ID to grant rights to (auto-detects authenticated user if not provided) | No |
| `--party-id <id>` | Party ID for party-specific rights | No |
| `--admin` | Grant ParticipantAdmin rights (default if no --party-id) | No |
| `--identity-provider <id>` | Identity provider ID | No |
| `--network <network>` | Target network (devnet\|testnet\|mainnet, defaults to CANTON_CURRENT_NETWORK) | No |
| `--provider <provider>` | Target provider (defaults to CANTON_CURRENT_PROVIDER) | No |
| `--help, -h` | Show help message | No |

## Rights Types

### Admin Rights

By default (or with `--admin` flag), the script grants **ParticipantAdmin** rights:

```typescript
{
  kind: {
    ParticipantAdmin: { value: {} }
  }
}
```

### Party Rights

When `--party-id` is specified, the script grants **CanActAs** and **CanReadAs** rights:

```typescript
[
  {
    kind: {
      CanActAs: { value: { party: "alice::party1" } }
    }
  },
  {
    kind: {
      CanReadAs: { value: { party: "alice::party1" } }
    }
  }
]
```

## Environment Variables

The script uses the standard Canton SDK environment variables. If `--network` and `--provider` are not specified, it uses:
- `CANTON_CURRENT_NETWORK` - The current network (devnet|testnet|mainnet)
- `CANTON_CURRENT_PROVIDER` - The current provider

Required environment variables pattern:
- `CANTON_{NETWORK}_{PROVIDER}_LEDGER_JSON_API_URI` - API endpoint URL
- `CANTON_{NETWORK}_{PROVIDER}_LEDGER_JSON_API_CLIENT_ID` - OAuth client ID
- `CANTON_{NETWORK}_{PROVIDER}_LEDGER_JSON_API_CLIENT_SECRET` - OAuth client secret (for client_credentials)
  OR
- `CANTON_{NETWORK}_{PROVIDER}_LEDGER_JSON_API_USERNAME` - Username (for password grant)
- `CANTON_{NETWORK}_{PROVIDER}_LEDGER_JSON_API_PASSWORD` - Password (for password grant)
- `CANTON_{NETWORK}_{PROVIDER}_AUTH_URL` - OAuth authorization URL

Optional:
- `CANTON_{NETWORK}_{PROVIDER}_USER_ID` - Default user ID for this combination

## Examples

### Example 1: Grant Admin Rights to Authenticated User

```bash
npm run grant-user-rights -- --admin
```

Output:
```
=== Grant User Rights Utility ===

Configuration:
  Network: from CANTON_CURRENT_NETWORK
  Provider: from CANTON_CURRENT_PROVIDER
  Target User ID: <will auto-detect from authenticated user>
  Rights Type: Admin Rights

Connected to Ledger JSON API
Fetching authenticated user ID...
Using authenticated user: participant_admin

Rights to grant: [
  {
    "kind": {
      "ParticipantAdmin": {
        "value": {}
      }
    }
  }
]

Checking current rights...
Current rights count: 3629

Granting rights...

✓ Successfully granted 0 new rights

(Rights may have already existed)

Verifying...
Final rights count: 3629

✓ Done!
```

### Example 2: Grant Admin Rights to Specific User on Specific Network

```bash
npm run grant-user-rights -- --user-id "5" --admin --network devnet --provider intellect
```

### Example 3: Grant Party Rights

```bash
npm run grant-user-rights -- --party-id "alice::party1"
```

## Error Handling

The script will:
- Display detailed error messages on failure
- Show stack trace for debugging
- Exit with code 1 on failure
- Exit with code 0 on success

## Related Files

- **Simulation**: `/Volumes/980/Code/Fairmint/workspace/canton-node-sdk/simulations/ledger-json-api/v2/users/list-user-rights.ts`
- **SDK Implementation**: `/Volumes/980/Code/Fairmint/workspace/canton-node-sdk/src/clients/ledger-json-api/operations/v2/users/grant-user-rights.ts`

## See Also

- List user rights: `client.listUserRights({ userId })`
- Revoke user rights: `client.revokeUserRights({ userId, rights })`
