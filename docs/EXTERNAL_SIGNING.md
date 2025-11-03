# External Signing SDK

This SDK provides utilities for creating and managing **external parties** in Canton - parties where the private key is managed by the user (e.g., in a wallet) rather than by the participant node.

## Quick Start

```typescript
import { Keypair } from '@stellar/stellar-base';
import { LedgerJsonApiClient, createExternalParty, prepareExternalTransaction, executeExternalTransaction } from '@fairmint/canton-node-sdk';

// 1. Create external party with a local keypair
const keypair = Keypair.random();
const ledgerClient = new LedgerJsonApiClient();

const party = await createExternalParty({
  ledgerClient,
  keypair,
  partyName: 'alice',
  synchronizerId: 'global-synchronizer',
});

// 2. Prepare a transaction
const prepared = await prepareExternalTransaction({
  ledgerClient,
  userId: party.userId,  // Required for authorization
  commands: [/* your commands */],
  actAs: [party.partyId],
  commandId: `cmd-${Date.now()}`,
  synchronizerId: 'global-synchronizer',
});

// 3. Sign the transaction hash
const hashBuffer = Buffer.from(prepared.preparedTransactionHash, 'base64');
const signature = keypair.sign(hashBuffer);

// 4. Execute the signed transaction
const result = await executeExternalTransaction({
  ledgerClient,
  preparedTransaction: prepared.preparedTransaction,
  partyId: party.partyId,
  signature: signature.toString('base64'),
  publicKeyFingerprint: party.publicKeyFingerprint,
  submissionId: `sub-${Date.now()}`,
  deduplicationPeriod: { DeduplicationDuration: { duration: '30s' } },
});
```

## What are External Parties?

In Canton, there are two types of parties:

- **Internal Parties**: The participant node holds the signing key and signs transactions on behalf of the party
- **External Parties**: The user holds the signing key externally (e.g., in a wallet or HSM)

External parties provide:
- ✅ **Enhanced security**: Private keys never leave the user's control
- ✅ **Wallet integration**: Works with hardware wallets, browser extensions, mobile wallets
- ✅ **User sovereignty**: Users maintain complete control over their digital identity
- ✅ **Multi-signature support**: Parties can require multiple signatures from different keys

## Onboarding an External Party

The onboarding process involves three steps:

### 1. Generate Key Pair

```typescript
import { Keypair } from '@stellar/stellar-base';

// Generate a new Stellar Ed25519 keypair
const keypair = Keypair.random();
console.log('Public Key:', keypair.publicKey());
console.log('Secret Key:', keypair.secret()); // Store securely!
```

### 2. Generate Topology

Request Canton to generate the topology transactions for the external party:

```typescript
const topology = await ledgerClient.generateExternalPartyTopology({
  synchronizer: 'global-synchronizer',
  partyHint: 'alice',
  publicKey: {
    format: 'CRYPTO_KEY_FORMAT_RAW',
    keyData: keypair.rawPublicKey().toString('base64'),
    keySpec: 'SIGNING_KEY_SPEC_EC_CURVE25519',
  },
});

// Returns:
// - partyId: The generated party ID (e.g., "alice::12abc...")
// - multiHash: Hash that needs to be signed
// - publicKeyFingerprint: Fingerprint of the public key
// - topologyTransactions: Transactions to submit
```

### 3. Sign and Allocate

Sign the multi-hash and submit to allocate the party:

```typescript
const hashBuffer = Buffer.from(topology.multiHash, 'base64');
const signature = keypair.sign(hashBuffer);

const result = await ledgerClient.allocateExternalParty({
  synchronizer: 'global-synchronizer',
  identityProviderId: 'default',
  onboardingTransactions: topology.topologyTransactions?.map(tx => ({ transaction: tx })) ?? [],
  multiHashSignatures: [{
    format: 'SIGNATURE_FORMAT_RAW',
    signature: signature.toString('base64'),
    signedBy: topology.publicKeyFingerprint,
    signingAlgorithmSpec: 'SIGNING_ALGORITHM_SPEC_ED25519',
  }],
});
```

### 4. Create User and Grant Rights

After allocating the party, create a user and grant permissions:

```typescript
const userId = `user-${result.partyId}`;

await ledgerClient.interactiveSubmissionCreateUser({
  user: {
    id: userId,
    primaryParty: result.partyId,
    isDeactivated: false,
    identityProviderId: 'default',
  },
  rights: [
    {
      kind: {
        CanActAs: { party: result.partyId },
      },
    },
  ],
});
```

Or use the convenience function (handles all steps automatically):

```typescript
import { createExternalParty } from '@fairmint/canton-node-sdk';

const party = await createExternalParty({
  ledgerClient,
  keypair,
  partyName: 'alice',
  synchronizerId: 'global-synchronizer',
});

// Returns: { partyId, userId, publicKeyFingerprint, ... }
```

## Submitting Externally Signed Transactions

External parties use a **prepare-sign-execute** flow:

### 1. Prepare Transaction

The participant interprets your commands and returns a prepared transaction:

```typescript
import { prepareExternalTransaction } from '@fairmint/canton-node-sdk';

const prepared = await prepareExternalTransaction({
  ledgerClient,
  userId: party.userId,  // User with CanActAs rights
  commands: [{
    CreateCommand: {
      templateId: 'MyPackage:MyModule:MyTemplate',
      createArgument: { field1: 'value1' },
    }
  }],
  actAs: ['alice::12abc...'],
  commandId: `create-contract-${Date.now()}`,
  synchronizerId: 'global-synchronizer',
});

// Returns:
// - preparedTransaction: The interpreted transaction
// - preparedTransactionHash: Hash to sign
// - hashingSchemeVersion: Version of hashing algorithm used
```

### 2. Sign Transaction Hash

Sign the transaction hash with your private key:

```typescript
const hashBuffer = Buffer.from(prepared.preparedTransactionHash, 'base64');
const signature = keypair.sign(hashBuffer);
const signatureBase64 = signature.toString('base64');
```

⚠️ **Important**: The signature is over the **entire transaction output**, not just the command. If the participant is malicious or faulty, validators will reject the transaction.

### 3. Execute Signed Transaction

Submit the prepared transaction with your signature:

```typescript
import { executeExternalTransaction } from '@fairmint/canton-node-sdk';

const result = await executeExternalTransaction({
  ledgerClient,
  preparedTransaction: prepared.preparedTransaction,
  partyId: 'alice::12abc...',
  signature: signatureBase64,
  publicKeyFingerprint: party.publicKeyFingerprint,
  submissionId: `sub-${Date.now()}`,
  deduplicationPeriod: {
    DeduplicationDuration: { duration: '30s' }
  },
});
```

## Multi-Hosted Parties

External parties can be hosted by multiple participants for enhanced security and availability:

```typescript
const topology = await ledgerClient.generateExternalPartyTopology({
  synchronizer: 'global-synchronizer',
  partyHint: 'alice',
  publicKey: { /* ... */ },
  // Party hosted by multiple participants
  otherConfirmingParticipantUids: [
    'participant2::fingerprint',
    'participant3::fingerprint',
  ],
  // Require at least 2 of 3 participants to confirm
  confirmationThreshold: 2,
});
```

## Key Management

### Stellar Keypairs

This SDK uses Stellar's Ed25519 keypairs, which are compatible with Canton's signing requirements:

```typescript
import { Keypair } from '@stellar/stellar-base';

// Generate new keypair
const keypair = Keypair.random();

// Load from secret
const keypair = Keypair.fromSecret('SABCD...');

// Convert to Canton format
const publicKeyBase64 = keypair.rawPublicKey().toString('base64');
```

### Storing Keys Securely

```typescript
// Save to encrypted file
const keyData = {
  partyId: result.partyId,
  stellarAddress: keypair.publicKey(),
  stellarSecret: keypair.secret(), // Encrypt this!
  publicKeyFingerprint: result.publicKeyFingerprint,
};

// ⚠️ Never commit private keys to git
// ⚠️ Encrypt before storing
// ⚠️ Use hardware wallets for production
```

## API Reference

### `createExternalParty(params)`

Onboards an external party in a single function call.

**Parameters:**
- `ledgerClient`: LedgerJsonApiClient instance
- `keypair`: Stellar Keypair object
- `partyName`: Hint for party ID
- `synchronizerId`: Synchronizer to onboard on

**Returns:** Party details with partyId, publicKeyFingerprint, etc.

---

### `prepareExternalTransaction(params)`

Prepares a transaction for external signing.

**Parameters:**
- `ledgerClient`: LedgerJsonApiClient instance
- `commands`: Array of commands to execute
- `actAs`: Array of party IDs acting
- `commandId`: Unique command identifier
- `synchronizerId`: Synchronizer ID
- `readAs` (optional): Parties with read-only access
- `disclosedContracts` (optional): Contracts to disclose

**Returns:** Prepared transaction and hash to sign

---

### `executeExternalTransaction(params)`

Executes a signed transaction.

**Parameters:**
- `ledgerClient`: LedgerJsonApiClient instance
- `preparedTransaction`: From prepare step
- `partyId`: Signing party ID
- `signature`: Base64-encoded signature
- `publicKeyFingerprint`: Fingerprint of signing key
- `submissionId`: Unique submission identifier
- `deduplicationPeriod`: Deduplication configuration

**Returns:** Execution result (empty on success)

## Architecture

### Trust Model

External parties allow you to **minimize trust** in the participant node:

1. **Onboarding**: You only trust the participant to construct valid topology transactions. Validators verify all signatures before accepting.

2. **Transaction Submission**: You sign the **entire transaction output**, not just your command. If the participant interprets incorrectly, validators reject the transaction.

3. **Multi-Hosting**: Host your party on multiple participants with a threshold requirement to eliminate single point of trust.

### Hashing Algorithm

Canton uses a specific hashing algorithm for transaction signatures. The current version is documented in the [External Signing Hashing Algorithm](https://docs.digitalasset.com/build/3.3/explanations/app-dev/external_signing_hashing.html) guide.

## Known Limitations

### Permission Requirements for Transaction Preparation

Canton requires that the user preparing transactions must have `CanReadAs` or `CanActAs` rights for all parties involved, even when using external signing. This presents a challenge:

1. After onboarding an external party, a Canton administrator must grant `CanReadAs` rights to the user that will prepare transactions
2. The M2M validator operator user typically doesn't have admin permissions to grant these rights programmatically
3. This requirement exists because Canton needs to validate that the transaction is well-formed before generating the hash for signing

**Current Status:**
- ✅ External party onboarding works
- ✅ Transfer offer creation works
- ❌ Transaction preparation blocked by permissions

**Workaround Options:**

**Option 1: Manual Rights Grant (Recommended)**

Have a Canton administrator manually grant rights after external party onboarding:

```typescript
// Using Canton Ledger API with admin credentials
await ledgerClient.grantUserRights({
  userId: '5',  // Or your validator operator user
  rights: [{
    kind: {
      CanReadAs: {
        value: {
          party: 'external-party-id::hash...'
        }
      }
    }
  }]
});
```

**Option 2: Use Admin Credentials**

Configure the SDK to use a Canton admin user with `ParticipantAdmin` or `IdentityProviderAdmin` rights for SDK operations.

## Troubleshooting

### Common Issues

**"Security-sensitive error" or HTTP 403 when preparing transactions**
- **Cause**: The user doesn't have `CanReadAs` rights for the external party
- **Solution**: Have a Canton admin grant the necessary rights (see Known Limitations above)
- **Verification**: Check user rights with `ledgerClient.listUserRights({ userId: '5' })`

**"Party not found" errors**
- Ensure the party is properly onboarded before attempting transactions
- Verify the party ID matches exactly (including the fingerprint)

**"Unknown or not connected synchronizer" errors**
- The synchronizer ID has changed or is incorrect
- Use `validatorClient.getOpenAndIssuingMiningRounds()` to get the current synchronizer ID

**Signature verification failures**
- Ensure you're using the same keypair that was used during onboarding
- Verify the public key fingerprint matches
- Check that the hash being signed is the `preparedTransactionHash` from the prepare response

## Further Reading

- [External Signing Overview](https://docs.digitalasset.com/build/3.3/tutorials/app-dev/external_signing_overview.html) - Comprehensive overview of external signing
- [Onboard External Party (Ledger API)](https://docs.digitalasset.com/build/3.3/tutorials/app-dev/external_signing_onboarding_lapi.html) - Step-by-step onboarding tutorial
- [Submit Externally Signed Transactions](https://docs.digitalasset.com/build/3.3/tutorials/app-dev/external_signing_submission.html) - Transaction submission guide
- [Topology Management](https://docs.digitalasset.com/overview/3.3/explanations/canton/topology.html) - Understanding Canton topology system
