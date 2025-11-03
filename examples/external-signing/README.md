# External Signing Examples

These examples demonstrate how to use the External Signing SDK for Canton with Privy for secure key
management.

## Prerequisites

1. Install dependencies:

```bash
npm install @privy-io/node
```

2. Set up environment variables:

```bash
# Privy credentials
export PRIVY_APP_ID="your-privy-app-id"
export PRIVY_APP_SECRET="your-privy-app-secret"

# Canton API endpoints (network and provider specific)
# See .env.example for full configuration
```

3. Privy account with API access

## Files

- `01-allocate-external-party.ts` - Allocate (onboard) an external party
- `03-create-transfer-offer.ts` - Create a transfer offer to an external party
- `04-accept-transfer-offer.ts` - Accept a transfer offer using external signing

## Complete Workflow

```bash
# Step 1: Allocate external party (no special permissions needed)
npx tsx examples/external-signing/01-allocate-external-party.ts alice

# Step 2: Create transfer offer (from internal party with funds)
npx tsx examples/external-signing/03-create-transfer-offer.ts ../keys/alice--<fingerprint>.json 10.0

# Step 3: Accept transfer offer (as external party using external signing)
npx tsx examples/external-signing/04-accept-transfer-offer.ts ../keys/alice--<fingerprint>.json
```

## Step-by-Step Guide

### Step 1: Allocate External Party

Creates a new external party with a Privy-managed Ed25519 wallet:

```bash
npx tsx examples/external-signing/01-allocate-external-party.ts alice
```

**This will:**

- Create a new Stellar Ed25519 wallet via Privy
- Create the party topology in Canton
- Sign the topology transactions via Privy API
- Allocate the party on Canton
- Save the wallet info to `../keys/alice--<fingerprint>.json`

**⚠️ Important**: Keep the generated keys file secure! The Privy wallet ID is needed for all future
signing operations.

**Output:**

```
✅ SUCCESS! External Party Onboarded
Party ID: alice::1220...
Keys saved to: ../keys/alice--1220...json
```

### Step 2: Create Transfer Offer

Creates a transfer offer to the external party (using an internal party with funds):

```bash
npx tsx examples/external-signing/03-create-transfer-offer.ts ../keys/alice--<fingerprint>.json 10.0
```

**This will:**

- Load the external party info from the keys file
- Create a transfer offer of 10.0 CC to the external party
- Save the offer info to `../keys/alice--<fingerprint>-offer.json`

**Output:**

```
✅ SUCCESS! Transfer Offer Created
Contract ID: 00...
Amount: 10.0 CC
Offer info saved to: ../keys/alice--...-offer.json
```

### Step 3: Accept Transfer with External Signing

Demonstrates the complete external signing workflow for accepting the transfer offer:

```bash
npx tsx examples/external-signing/04-accept-transfer-offer.ts ../keys/alice--<fingerprint>.json
```

**This will:**

- Load the external party's Privy wallet info from file
- Load the transfer offer info (from step 3)
- Prepare a transaction to accept the transfer offer
- Sign the transaction hash via Privy API
- Execute the signed transaction on Canton
- The external party receives the funds
- Clean up the offer file

**Output:**

```
✅ SUCCESS! Transfer Accepted
Transaction executed successfully
Offer file cleaned up
```

**Note:** If you encounter HTTP 403 errors, ensure your validator operator has the necessary
permissions to execute transactions for external parties.

## How It Works

### External Party Allocation with Privy

```typescript
import { createPrivyClient, createExternalPartyPrivy } from '@fairmint/canton-node-sdk';

// Initialize Privy client
const privy = createPrivyClient({
  appId: process.env.PRIVY_APP_ID!,
  appSecret: process.env.PRIVY_APP_SECRET!,
});

// Allocate party on Canton (Privy creates wallet automatically)
const party = await createExternalPartyPrivy({
  privyClient: privy,
  ledgerClient,
  partyName: 'alice',
  synchronizerId: 'global-domain::1220...',
});

// Save wallet info securely
console.log('Party ID:', party.partyId);
console.log('Wallet ID:', party.wallet.id); // Keep secure!
```

### External Transaction Signing with Privy

```typescript
import {
  prepareExternalTransaction,
  executeExternalTransaction,
  signWithPrivyWallet,
  createPrivyClient,
} from '@fairmint/canton-node-sdk';

// Initialize Privy client
const privy = createPrivyClient({
  appId: process.env.PRIVY_APP_ID!,
  appSecret: process.env.PRIVY_APP_SECRET!,
});

// 1. Prepare transaction (generates hash to sign)
const prepared = await prepareExternalTransaction({
  ledgerClient,
  commands: [
    /* your commands */
  ],
  actAs: [externalPartyId],
  commandId: `cmd-${Date.now()}`,
  synchronizerId: 'global-domain::1220...',
});

// 2. Sign the hash via Privy
const signature = await signWithPrivyWallet(privy, walletId, prepared.preparedTransactionHash);

// 3. Execute signed transaction
await executeExternalTransaction({
  ledgerClient,
  preparedTransaction: prepared.preparedTransaction,
  partyId: externalPartyId,
  signature,
  publicKeyFingerprint,
  submissionId: `sub-${Date.now()}`,
  deduplicationPeriod: { DeduplicationDuration: { duration: '30s' } },
});
```

## Security

**⚠️ IMPORTANT: Never commit key files to git!**

The key files contain the Privy wallet ID which controls the external party. Keep these files
secure:

- Add `keys/` to your `.gitignore`
- Use encrypted storage for production wallet IDs
- Backup wallet info securely
- Never share wallet IDs publicly
- Keep your Privy App Secret secure (never commit to git)

**Privy Security Benefits:**

- Private keys never leave Privy's secure infrastructure
- No need to manage key storage locally
- Built-in key rotation and recovery options
- Enterprise-grade security for production use

## Troubleshooting

### "Security-sensitive error" or HTTP 403 in Step 3

**Cause:** The validator operator user doesn't have sufficient permissions to execute transactions
for external parties.

**Solution:** Contact your Canton administrator to grant the necessary permissions
(`CanExecuteAsAnyParty` or `CanReadAs` rights for the external party).

### "Key file not found"

**Cause:** Using the wrong path or file was deleted.

**Solution:** Ensure you're using the correct relative path from the examples directory (e.g.,
`../keys/alice--...json`)

### "Unknown or not connected synchronizer"

**Cause:** The synchronizer ID has changed or is incorrect.

**Solution:** The SDK automatically fetches the current synchronizer ID. If this persists, check
your network connection.

### "No transfer offer found"

**Cause:** Step 2 hasn't been run yet or the offer file was deleted.

**Solution:** Run step 2 to create a transfer offer before attempting step 3.

## Further Reading

- [External Signing Documentation](../../docs/EXTERNAL_SIGNING.md) - Complete guide to external
  signing
- [Canton External Signing Overview](https://docs.digitalasset.com/build/3.3/tutorials/app-dev/external_signing_overview.html)
- [Canton Topology Management](https://docs.digitalasset.com/overview/3.3/explanations/canton/topology.html)
