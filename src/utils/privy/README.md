# Privy Stellar Wallet Utilities

Utilities for creating, retrieving, and signing with Stellar wallets using Privy.

## Overview

This module provides TypeScript utilities for managing Stellar wallets through the Privy API. Privy
handles wallet creation and key management, making it easy to integrate Stellar wallet functionality
into your Canton applications.

## Setup

1. Get your Privy credentials from [dashboard.privy.io](https://dashboard.privy.io/)
2. Add them to your `.env` file:

```bash
PRIVY_APP_ID=your_app_id_here
PRIVY_APP_SECRET=your_app_secret_here
```

## Usage

### Create a Privy Client

```typescript
import { createPrivyClient, createPrivyClientFromEnv } from '@fairmint/canton-node-sdk';

// From environment variables
const privy = createPrivyClientFromEnv();

// Or with explicit credentials
const privy = createPrivyClient({
  appId: 'your-app-id',
  appSecret: 'your-app-secret',
});
```

### Create a Stellar Wallet

**Option 1: Create an unlinked wallet (new user)**

```typescript
import { createStellarWallet } from '@fairmint/canton-node-sdk';

// Create an unlinked wallet
const wallet = await createStellarWallet(privy);
console.log('Wallet ID:', wallet.id);
console.log('Stellar Address:', wallet.address);
console.log('Public Key (base64):', wallet.publicKeyBase64);
```

**Option 2: Add wallet to existing Privy user (common use case)**

This is the common use case when users already exist in your database with a Privy ID and possibly
other wallets (Solana, Ethereum, etc.).

```typescript
// User already exists with Privy ID from your database
const existingPrivyUserId = 'did:privy:cm94jlli5020iky0lbo19pwf3';

// Create a Stellar embedded wallet linked to this existing user
const userWallet = await createStellarWallet(privy, {
  userId: existingPrivyUserId,
});

console.log('Wallet ID:', userWallet.id);
console.log('Stellar Address:', userWallet.address);

// The wallet is now linked to the user in Privy's system
// Verify in the Privy Dashboard under the user's wallets

// Save to your database
// UPDATE users SET stellar_wallet_address = userWallet.address WHERE privy_user_id = existingPrivyUserId
```

**Important Notes:**

- The `owner` property may not be returned in the API response, but the wallet IS linked to the user
  in Privy's system
- You can verify the linkage in the Privy Dashboard
- Embedded wallets require user authentication for signing (cannot be done server-side only)
- Use Privy's client SDK in your frontend for transaction signing

// Create a wallet linked to a Privy user const userWallet = await createStellarWallet(privy, {
userId: 'did:privy:...', });

````

### Retrieve an Existing Wallet

```typescript
import { getStellarWallet } from '@fairmint/canton-node-sdk';

const wallet = await getStellarWallet(privy, 'wallet-id-here');
console.log('Address:', wallet.address);
````

### Sign Data

```typescript
import { signWithWallet } from '@fairmint/canton-node-sdk';

// Sign hex data
const result = await signWithWallet(privy, {
  walletId: wallet.id,
  data: 'deadbeef',
});

console.log('Signature (hex):', result.signature);
console.log('Signature (base64):', result.signatureBase64);

// Sign a Buffer
const bufferResult = await signWithWallet(privy, {
  walletId: wallet.id,
  data: Buffer.from('test message to sign'),
});
```

## API Reference

### `createPrivyClient(options)`

Creates a Privy client with explicit credentials.

**Parameters:**

- `options.appId` - Privy App ID
- `options.appSecret` - Privy App Secret

**Returns:** `PrivyClient`

### `createPrivyClientFromEnv()`

Creates a Privy client from environment variables (`PRIVY_APP_ID` and `PRIVY_APP_SECRET`).

**Returns:** `PrivyClient`

### `createStellarWallet(privyClient, options?)`

Creates a new Stellar wallet.

**Parameters:**

- `privyClient` - Configured Privy client
- `options.userId` (optional) - User ID to link wallet to (format: `did:privy:...`)

**Returns:** `Promise<StellarWallet>`

### `getStellarWallet(privyClient, walletId)`

Retrieves an existing Stellar wallet.

**Parameters:**

- `privyClient` - Configured Privy client
- `walletId` - The wallet ID to retrieve

**Returns:** `Promise<StellarWallet>`

### `signWithWallet(privyClient, options)`

Signs data using a Stellar wallet.

**Parameters:**

- `privyClient` - Configured Privy client
- `options.walletId` - Wallet ID to sign with
- `options.data` - Data to sign (hex string or Buffer)

**Returns:** `Promise<SignResult>`

## Types

### `StellarWallet`

```typescript
interface StellarWallet {
  id: string; // Wallet ID
  address: string; // Stellar public address
  chain_type: 'stellar';
  owner?: { user_id: string }; // Owner info if linked
  publicKeyBase64: string; // Base64 encoded public key
}
```

### `SignResult`

```typescript
interface SignResult {
  signature: string; // Signature in hex (with 0x prefix)
  encoding: string; // Encoding format
  signatureBase64: string; // Signature in base64
}
```

## Running the Examples

Two complete working examples are available:

### Example 1: Creating a New Wallet (`test/privy.example.ts`)

Creates a standalone wallet (not linked to a user). To run it:

## Running the Example

A complete working example is available in `test/privy.example.ts`. To run it:

```bash
# From the canton-node-sdk directory
cd /path/to/canton-node-sdk

# Set up environment variables
cp example.env .env
# Edit .env and add your PRIVY_APP_ID and PRIVY_APP_SECRET

# Install dependencies
npm install

# Run the example
tsx test/privy.example.ts
```

The example will create a real Stellar wallet, retrieve it, and sign test data.

### Example 2: Adding Stellar Wallet to Existing User (`test/privy.add-stellar-wallet.example.ts`)

Demonstrates how to add a Stellar wallet to an existing Privy user (common use case for users with
existing Solana/Ethereum wallets). To run it:

```bash
# Run with a Privy user ID from your database
npx tsx test/privy.add-stellar-wallet.example.ts did:privy:YOUR_USER_ID

# Example
npx tsx test/privy.add-stellar-wallet.example.ts did:privy:cm94jlli5020iky0lbo19pwf3
```

The example will:

1. Create a new Stellar embedded wallet linked to the specified user
2. Verify the wallet can be retrieved
3. Show database update SQL example
4. Explain how to use the wallet for signing (client-side)

**Note**: Due to ESM compatibility issues with Jest, the Privy utilities are tested using the
example files with `tsx` rather than Jest unit tests. **Note**: Due to ESM compatibility issues with
Jest, the Privy utilities are tested using the example file with `tsx` rather than Jest unit tests.

## Canton Network Integration

### Generating Canton Party IDs from Privy Wallets

You can use Privy Stellar wallets to generate Canton Network party IDs. This allows users to
interact with Canton Network using their Privy-managed wallets.

A complete example is available in `test/canton-party-from-privy-wallet.example.ts`.

**Setup:**

1. Install Canton Network SDK: `npm install @canton-network/wallet-sdk`
2. Set `CANTON_SCAN_PROXY_URL` in your `.env` file
3. Have Privy credentials configured

**Example:**

```typescript
import { createPrivyClientFromEnv, createStellarWallet } from '@fairmint/canton-node-sdk';
import { WalletSDKImpl } from '@canton-network/wallet-sdk';
import { StrKey } from '@stellar/stellar-base';

// Create Privy wallet
const privy = createPrivyClientFromEnv();
const wallet = await createStellarWallet(privy, { userId: 'did:privy:...' });

// Initialize Canton SDK
const sdk = new WalletSDKImpl().configure({...});
await sdk.connect();
await sdk.connectTopology(process.env.CANTON_SCAN_PROXY_URL);

// Generate external party
const generatedParty = await sdk.userLedger?.generateExternalParty(
  wallet.publicKeyBase64,
  'party-hint'
);

// Sign with Privy (requires user authentication for embedded wallets)
const { signature } = await privy.wallets().rawSign(wallet.id, {
  params: { hash: '0x' + hexHash }
});

// Allocate party
const allocatedParty = await sdk.userLedger?.allocateExternalParty(
  signatureBase64,
  generatedParty
);

console.log('Canton Party ID:', allocatedParty.partyId);
```

**Running the example:**

```bash
# Create new wallet and generate party
npx tsx test/canton-party-from-privy-wallet.example.ts

# Use existing wallet
npx tsx test/canton-party-from-privy-wallet.example.ts <wallet-id> <party-hint>

# Create wallet for user and generate party
npx tsx test/canton-party-from-privy-wallet.example.ts did:privy:<user-id> <party-hint>
```

See the
[Canton Network documentation](https://docs.dev.sync.global/app_dev/validator_api/index.html#scan-proxy-api)
for more details on the Scan Proxy API.
