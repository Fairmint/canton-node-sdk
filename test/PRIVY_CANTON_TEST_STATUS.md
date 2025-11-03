# Canton + Privy Integration Status

## ✅ What's Working

1. **Privy Wallet Management** ✓
   - Creating Stellar wallets
   - Retrieving wallets
   - Signing data with wallets
   - Automatic credential detection from `.env`

2. **Canton Network Authentication** ✓
   - OAuth2 authentication with Canton devnet
   - Automatic detection of existing Canton credentials
   - Token acquisition and refresh
   - Proper authority URL formatting

3. **Canton SDK Initialization** ✓
   - LedgerController creation with correct Ledger API URI
   - TokenStandardController creation
   - AdminLedger connection
   - UserLedger connection

4. **Environment Configuration** ✓
   - Automatic detection of `CANTON_DEVNET_5N_*` variables
   - Automatic detection of `CANTON_DEVNET_INTELLECT_*` variables
   - Fallback to generic `CANTON_OAUTH_*` variables
   - Proper OAuth authority conversion (strips `/token`, adds client ID)

## ❌ What's Needed

### 1. Synchronizer ID for Canton DevNet

**Current Status**: The script needs the actual synchronizer ID for Canton DevNet.

**What We Know**:

- Format is correct: `global::{hash}`
- Example: `global::122041068e66805bb07d7468f314076fc5ffef76bb8b2bf29af83c23f88ceb0829c1`
- The participant is not connected to the test synchronizer ID

**How to Get It**: Contact the Digital Assets / Canton Network team and ask for:

- The synchronizer ID (or domain ID) for Canton DevNet
- Or access to an API endpoint that lists available synchronizers

**Alternative**: If there's a way to discover synchronizers without a party ID, we can add that
logic to the script.

### 2. Update Script Once We Have the Synchronizer ID

Once you have the correct synchronizer ID, update line 412 in
`test/canton-party-from-privy-wallet.example.ts`:

```typescript
const synchronizerId = 'global::{correct-hash-here}';
```

## 📊 Summary of Changes

### Files Created/Modified

1. **`canton-node-sdk/src/utils/privy/`** - New Privy wallet utilities library
2. **`canton-node-sdk/test/canton-party-from-privy-wallet.example.ts`** - Main integration script
3. **`canton-node-sdk/test/privy.example.ts`** - Privy wallet examples
4. **`canton-node-sdk/test/privy.add-stellar-wallet.example.ts`** - Add wallet to user examples
5. **`canton-node-sdk/example.env`** - Updated with all necessary environment variables
6. **`canton-node-sdk/CANTON_DEVNET_SETUP.md`** - Setup documentation
7. **`canton-node-sdk/package.json`** - Added dependencies (`@privy-io/node`,
   `@stellar/stellar-base`, `@canton-network/wallet-sdk`, `pino`)

### Configuration Auto-Detection

The script now automatically detects and uses (in priority order):

1. `CANTON_DEVNET_5N_*` variables (5N provider)
2. `CANTON_DEVNET_INTELLECT_*` variables (Intellect provider)
3. `CANTON_OAUTH_*` variables (generic fallback)

### OAuth Authority Handling

The script correctly handles different auth URL formats:

- `https://auth.example.com/application/o/token` →
  `https://auth.example.com/application/o/{clientId}/`
- `https://keycloak.example.com/auth/realms/realm/protocol/openid-connect/token` →
  `https://keycloak.example.com/auth/realms/realm/protocol/openid-connect/`

## 🚀 Next Steps

1. **Contact Canton Network Team**: Get the correct synchronizer ID for devnet
2. **Update Script**: Replace the hardcoded synchronizer ID
3. **Test End-to-End**: Run the complete flow from wallet creation to party allocation
4. **Optional**: Add synchronizer discovery logic if an API is available

## 📝 Running the Script

```bash
# Prerequisites
cd canton-node-sdk
npm install

# Ensure .env is configured with:
# - PRIVY_APP_ID and PRIVY_APP_SECRET
# - CANTON_DEVNET_5N_* (or equivalent Canton credentials)
# - CANTON_SCAN_PROXY_URL

# Run the script
npx tsx test/canton-party-from-privy-wallet.example.ts

# Or with specific wallet ID and party hint
npx tsx test/canton-party-from-privy-wallet.example.ts <wallet-id> <party-hint>
```

## 🔍 Debugging

The script includes extensive logging:

- OAuth token acquisition
- SDK initialization steps
- Ledger controller creation
- Synchronizer ID setting
- API endpoint testing

All logs are output to console for easy debugging.

## 📚 Resources

- [Canton Network Documentation](https://docs.dev.sync.global/)
- [Canton Wallet SDK](https://www.npmjs.com/package/@canton-network/wallet-sdk)
- [Privy Documentation](https://docs.privy.io/)
- [Stellar Documentation](https://developers.stellar.org/)
