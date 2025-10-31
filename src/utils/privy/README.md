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

**Option 2: Add wallet to existing Privy user**

This is the common use case when users already exist in your database with a Privy ID and possibly
other wallets (Solana, Ethereum, etc.).

```typescript
// User already exists with Privy ID from your database
const existingPrivyUserId = 'did:privy:cm94jlli5020iky0lbo19pwf3';

// Create a Stellar wallet linked to this existing user
const userWallet = await createStellarWallet(privy, {
  userId: existingPrivyUserId,
});

console.log('Wallet linked to user:', userWallet.owner?.user_id);
console.log('Stellar Address:', userWallet.address);

// Save to your database
// UPDATE users SET stellar_wallet_address = userWallet.address WHERE privy_user_id = existingPrivyUserId
```

### Retrieve an Existing Wallet

```typescript
import { getStellarWallet } from '@fairmint/canton-node-sdk';

const wallet = await getStellarWallet(privy, 'wallet-id-here');
console.log('Address:', wallet.address);
```

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

1. Create a new Stellar wallet linked to the specified user
2. Verify the wallet was properly linked
3. Test signing with the new wallet
4. Show database update SQL example

**Note**: Due to ESM compatibility issues with Jest, the Privy utilities are tested using the
example files with `tsx` rather than Jest unit tests.
