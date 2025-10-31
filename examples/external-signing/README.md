# External Signing Examples

These examples demonstrate how to use the External Signing SDK for Canton.

## Prerequisites

1. Install dependencies:
```bash
npm install @stellar/stellar-base
```

2. Set up environment variables:
```bash
export LEDGER_JSON_API_URL="https://your-canton-node/api/ledger-json-api"
export LEDGER_JSON_API_TOKEN="your-auth-token"
export VALIDATOR_API_URL="https://your-validator/api/validator"
export VALIDATOR_API_TOKEN="your-validator-token"
```

3. Canton administrator access (for step 2 - granting rights)

## Files

- `01-allocate-external-party.ts` - Allocate (onboard) an external party
- `02-grant-external-party-read-rights.ts` - Grant CanReadAs rights (requires admin)
- `03-create-transfer-offer.ts` - Create a transfer offer to an external party
- `04-accept-transfer-offer.ts` - Accept a transfer offer using external signing

## Complete Workflow

```bash
# Step 1: Allocate external party
npx tsx examples/external-signing/01-allocate-external-party.ts alice

# Step 2: Grant read rights (may require admin intervention)
npx tsx examples/external-signing/02-grant-external-party-read-rights.ts ../keys/alice--<fingerprint>.json

# Step 3: Create transfer offer (from internal party with funds)
npx tsx examples/external-signing/03-create-transfer-offer.ts ../keys/alice--<fingerprint>.json 10.0

# Step 4: Accept transfer offer (as external party using external signing)
npx tsx examples/external-signing/04-accept-transfer-offer.ts ../keys/alice--<fingerprint>.json
```

## Step-by-Step Guide

### Step 1: Allocate External Party

Creates a new external party with a locally-generated Ed25519 keypair:

```bash
npx tsx examples/external-signing/01-allocate-external-party.ts alice
```

**This will:**
- Generate a new Stellar Ed25519 keypair
- Create the party topology in Canton
- Sign the topology transactions with the local key
- Allocate the party on Canton
- Save the keys to `../keys/alice--<fingerprint>.json`

**⚠️ Important**: Keep the generated keys file secure! The secret key is needed for all future transactions.

**Output:**
```
✅ SUCCESS! External Party Onboarded
Party ID: alice::1220...
Keys saved to: ../keys/alice--1220...json
```

### Step 2: Grant Read Rights

Attempts to grant `CanReadAs` rights to the validator operator user for the external party:

```bash
npx tsx examples/external-signing/02-grant-external-party-read-rights.ts ../keys/alice--<fingerprint>.json
```

**This will:**
- Try to grant `CanReadAs` rights to the validator operator user
- If successful (✅): Proceed to step 3
- If permission denied (❌): Display instructions for manual admin intervention

**Expected Result (Most Common):**

```
⚠️  ADMIN INTERVENTION REQUIRED

The validator operator user does not have permission to grant rights.
This is expected - granting rights requires admin permissions.

📋 Next Steps:
1. Contact your Canton administrator
2. Ask them to grant CanReadAs rights using: [code snippet provided]
```

**Why This Step is Required:**

Canton requires that the user preparing transactions must have `CanReadAs` rights for all parties involved, even with external signing. This is because Canton needs to validate the transaction is well-formed before generating the hash for signing.

Without these rights, step 4 will fail with: `HTTP 403: "Security-sensitive error has been received"`

### Step 3: Create Transfer Offer

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

### Step 4: Accept Transfer with External Signing

Demonstrates the complete external signing workflow for accepting the transfer offer:

```bash
npx tsx examples/external-signing/04-accept-transfer-offer.ts ../keys/alice--<fingerprint>.json
```

**Prerequisites:** Step 2 (rights granting) must be completed successfully.

**This will:**
- Load the external party's keypair from file
- Load the transfer offer info (from step 3)
- Prepare a transaction to accept the transfer offer
- Sign the transaction hash with the external Stellar keypair
- Execute the signed transaction on Canton
- The external party receives the funds
- Clean up the offer file

**Output:**
```
✅ SUCCESS! Transfer Accepted
Transaction executed successfully
Offer file cleaned up
```

**If this fails with HTTP 403:** The rights were not granted in step 2. See step 2 output for instructions.

## How It Works

### External Party Allocation

```typescript
import { Keypair } from '@stellar/stellar-base';
import { createExternalParty } from '@fairmint/canton-node-sdk';

// Generate keypair
const keypair = Keypair.random();

// Allocate party on Canton
const party = await createExternalParty({
  ledgerClient,
  keypair,
  partyName: 'alice',
  synchronizerId: 'global-domain::1220...',
});

// Save keys securely
console.log('Party ID:', party.partyId);
console.log('Secret Key:', keypair.secret()); // Keep secure!
```

### External Transaction Signing

```typescript
import {
  prepareExternalTransaction,
  executeExternalTransaction,
  signWithStellarKeypair
} from '@fairmint/canton-node-sdk';

// 1. Prepare transaction (generates hash to sign)
const prepared = await prepareExternalTransaction({
  ledgerClient,
  commands: [/* your commands */],
  actAs: [externalPartyId],
  commandId: `cmd-${Date.now()}`,
  synchronizerId: 'global-domain::1220...',
});

// 2. Sign the hash with external keypair
const signature = signWithStellarKeypair(
  keypair,
  prepared.preparedTransactionHash
);

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

The key files contain the Stellar secret key which controls the external party. Keep these files secure:

- Add `keys/` to your `.gitignore`
- Use encrypted storage for production keys
- Backup keys securely
- Never share secret keys

## Troubleshooting

### "Security-sensitive error" or HTTP 403 in Step 4

**Cause:** Rights were not granted in step 2.

**Solution:** Have a Canton administrator manually grant `CanReadAs` rights using the code snippet from step 2's output.

### "Key file not found"

**Cause:** Using the wrong path or file was deleted.

**Solution:** Ensure you're using the correct relative path from the examples directory (e.g., `../keys/alice--...json`)

### "Unknown or not connected synchronizer"

**Cause:** The synchronizer ID has changed or is incorrect.

**Solution:** The SDK automatically fetches the current synchronizer ID. If this persists, check your network connection.

### "No transfer offer found"

**Cause:** Step 3 hasn't been run yet or the offer file was deleted.

**Solution:** Run step 3 to create a transfer offer before attempting step 4.

## Further Reading

- [External Signing Documentation](../../docs/EXTERNAL_SIGNING.md) - Complete guide to external signing
- [Canton External Signing Overview](https://docs.digitalasset.com/build/3.3/tutorials/app-dev/external_signing_overview.html)
- [Canton Topology Management](https://docs.digitalasset.com/overview/3.3/explanations/canton/topology.html)
