# Canton Node SDK - LocalNet Examples

Simple examples for connecting to Canton Network LocalNet using the Canton Node SDK.

## Prerequisites

- cn-quickstart is running (see https://github.com/digital-asset/cn-quickstart)
- cn-quickstart is configured with OAuth2 enabled
- Dependencies installed: `npm install`

## Examples

### `localnet-with-oauth2.ts` - OAuth2 Authentication ✅

**Status**: ✅ **Working** - This is the recommended example!

Demonstrates how to:
- Connect to cn-quickstart with OAuth2/Keycloak authentication
- Use the SDK's built-in authentication manager
- Make authenticated API calls to the Validator API

**Run it:**
```bash
npm run example:oauth2
```

**What it does:**
1. Authenticates with Keycloak using client credentials
2. Gets an OAuth2 access token
3. Makes an authenticated API call to get user status
4. The SDK handles all token management automatically!

**Key Features:**
- ✅ Automatic token acquisition
- ✅ Automatic token refresh when expired
- ✅ Bearer token automatically included in requests
- ✅ No manual token management needed

### Configuration

The example uses the default cn-quickstart OAuth2 configuration:

```typescript
{
  authUrl: 'http://localhost:8082/realms/AppProvider/protocol/openid-connect/token',
  apis: {
    VALIDATOR_API: {
      apiUrl: 'http://localhost:3903',
      auth: {
        grantType: 'client_credentials',
        clientId: 'app-provider-validator',
        clientSecret: 'AL8648b9SfdTFImq7FV56Vd0KHifHBuC',
      },
    },
  },
}
```

## Try Other API Methods

Once you have a working client, you can call any Validator API method:

```typescript
// Get wallet balance
const balance = await client.getWalletBalance();

// Get amulets
const amulets = await client.getAmulets();

// Get DSO party ID
const dsoPartyId = await client.getDsoPartyId();

// Get amulet rules
const rules = await client.getAmuletRules();

// List ANS entries
const entries = await client.listAnsEntries();
```

## Next Steps

1. **Explore the SDK**: Check out the full API documentation at https://sdk.canton.fairmint.com/
2. **Stream Updates**: See `scripts/examples/` for streaming and subscription examples
3. **Integration Tests**: Look at `test/integration/quickstart/` for more complex examples
4. **Web UIs**: Explore the running services:
   - Wallet: http://wallet.localhost:3000
   - Scan: http://scan.localhost:4000

## Troubleshooting

### Authentication Failed

```bash
# Verify Keycloak is running
curl http://localhost:8082/realms/AppProvider

# Check cn-quickstart OAuth2 setup
cd quickstart && make setup  # Ensure "with OAuth2" is selected
```

### Connection Refused

```bash
# Check if services are running
cd quickstart && make status

# Restart if needed
cd quickstart && make restart
```

### Wrong Credentials

The credentials in the example (`app-provider-validator` / `AL8648b9SfdTFImq7FV56Vd0KHifHBuC`) are the default values for cn-quickstart. If you've customized your setup, check:

- `quickstart/docker/modules/keycloak/env/app-provider/on/oauth2.env`

## More Resources

- Main README: `../../examples/README.md`
- SDK Documentation: https://sdk.canton.fairmint.com/
- cn-quickstart: https://github.com/digital-asset/cn-quickstart
