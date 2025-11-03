# Privy Wallet Signing Considerations

## Overview

Privy supports two fundamentally different types of wallets with **very different signing capabilities**. Understanding this distinction is critical for implementing Canton Network integration correctly.

## 🔑 The Two Types of Privy Wallets

### 1. Standalone Wallets (Server-Side Signing ✅)

**What they are:**
- Wallets created WITHOUT a userId
- Not linked to any specific user account
- Fully controlled by your backend application
- Managed using your Privy app credentials (PRIVY_APP_ID + PRIVY_APP_SECRET)

**How to create:**
```typescript
import { createStellarWallet } from '../src/utils/privy';

// No userId parameter = standalone wallet
const wallet = await createStellarWallet(privy);
```

**Signing capability:**
- ✅ **Can sign server-side** using `privy.wallets().rawSign()`
- ✅ No user authentication required
- ✅ Your backend has full control
- ✅ Works immediately after creation

**Use cases:**
- System/service wallets
- Automated backend processes
- Testing and development
- Administrative operations
- Backend-controlled Canton parties

**Example in codebase:**
- `test/privy.example.ts` (lines 44-48)
- `test/canton-party-from-privy-wallet.example.ts` (when run without userId)

### 2. Embedded Wallets (Client-Side Signing Only ❌)

**What they are:**
- Wallets created WITH a userId (format: `did:privy:...`)
- Linked to a specific user's Privy account
- Controlled by the user through Privy's authentication
- Keys are managed by Privy but require user session

**How to create:**
```typescript
import { createStellarWallet } from '../src/utils/privy';

// With userId = embedded wallet linked to user
const wallet = await createStellarWallet(privy, {
  userId: 'did:privy:cm94jlli5020iky0lbo19pwf3'
});
```

**Signing capability:**
- ❌ **Cannot sign server-side** - will fail with "No valid user session keys"
- ✅ **Can only sign client-side** after user authentication
- ❌ Backend API calls to `privy.wallets().rawSign()` will fail
- ✅ Must use Privy's frontend SDK with authenticated user

**Use cases:**
- User-controlled wallets
- Real user transactions
- User-owned Canton parties
- Production application user accounts

**Example in codebase:**
- `test/privy.add-stellar-wallet.example.ts` (lines 87-89) - **note: no signing attempted!**
- `test/canton-party-from-privy-wallet.example.ts` (when run with userId - signing will fail)

## 📊 Comparison Table

| Feature | Standalone Wallets | Embedded Wallets |
|---------|-------------------|------------------|
| **Created with userId?** | No | Yes (required) |
| **Server-side signing** | ✅ Yes | ❌ No |
| **Client-side signing** | N/A | ✅ Yes (required) |
| **User authentication needed** | ❌ No | ✅ Yes |
| **Backend control** | Full | Limited (creation only) |
| **Best for** | System operations | User operations |
| **Security model** | App credentials | User session + Privy auth |

## 🏗️ Architecture Patterns

### Pattern 1: Standalone Wallets (Current DevNet Tests)

**Flow:**
```
Backend
  └─> Create standalone wallet
  └─> Sign with wallet (server-side)
  └─> Submit to Canton
```

**Implementation:**
```typescript
// Create wallet
const wallet = await createStellarWallet(privy);

// Sign immediately (works!)
const signResult = await privy.wallets().rawSign(wallet.id, {
  params: { hash: `0x${hexData}` }
});

// Use signature
const allocatedParty = await sdk.userLedger?.allocateExternalParty(
  signatureBase64,
  generatedParty
);
```

**Status:** ✅ Working in our DevNet integration tests

### Pattern 2: Embedded Wallets (Production User Flow)

**Flow:**
```
Backend                          Frontend
  └─> Create embedded wallet       └─> User authenticates
  └─> Generate Canton topology     └─> Get signing challenge
  └─> Send hash to frontend        └─> Sign with Privy SDK
       ↑                                 ↓
       └─────── Signature ──────────────┘
  └─> Allocate Canton party
```

**Implementation:**

**Backend (Step 1 - Create wallet):**
```typescript
// Create wallet for user
const wallet = await createStellarWallet(privy, {
  userId: 'did:privy:...'
});

// Save to database
await db.users.update({
  where: { privyId: userId },
  data: {
    stellarWalletId: wallet.id,
    stellarAddress: wallet.address
  }
});
```

**Backend (Step 2 - Generate topology):**
```typescript
// API endpoint: POST /api/canton/generate-party
async function generatePartyTopology(req, res) {
  const { walletId } = req.body;

  // Get wallet
  const wallet = await getStellarWallet(privy, walletId);

  // Generate Canton party topology
  const generatedParty = await sdk.userLedger?.generateExternalParty(
    wallet.publicKeyBase64,
    'user-party-hint'
  );

  // Store temporarily (session/redis)
  await storeTopology(req.userId, generatedParty);

  // Send hash to frontend for signing
  res.json({
    multiHash: generatedParty.multiHash,
    partyId: generatedParty.partyId
  });
}
```

**Frontend (Step 3 - User signs):**
```typescript
// Using Privy React SDK
import { usePrivy } from '@privy-io/react-auth';

async function signCantonHash() {
  const { user, signMessage } = usePrivy();

  // Get hash from backend
  const response = await fetch('/api/canton/generate-party', {
    method: 'POST',
    body: JSON.stringify({ walletId: user.stellarWalletId })
  });

  const { multiHash } = await response.json();

  // Convert base64 to hex for signing
  const hashBuffer = Buffer.from(multiHash, 'base64');
  const hashHex = hashBuffer.toString('hex');

  // User signs with Privy (requires authentication!)
  const signature = await signMessage(`0x${hashHex}`);

  // Send signature to backend
  await fetch('/api/canton/allocate-party', {
    method: 'POST',
    body: JSON.stringify({ signature })
  });
}
```

**Backend (Step 4 - Allocate party):**
```typescript
// API endpoint: POST /api/canton/allocate-party
async function allocateParty(req, res) {
  const { signature } = req.body;

  // Retrieve stored topology
  const generatedParty = await getTopology(req.userId);

  // Convert signature to base64
  const signatureHex = signature.startsWith('0x')
    ? signature.slice(2)
    : signature;
  const signatureBase64 = Buffer.from(signatureHex, 'hex').toString('base64');

  // Allocate party with user's signature
  const allocatedParty = await sdk.userLedger?.allocateExternalParty(
    signatureBase64,
    generatedParty
  );

  // Save to database
  await db.users.update({
    where: { id: req.userId },
    data: { cantonPartyId: allocatedParty.partyId }
  });

  res.json({ partyId: allocatedParty.partyId });
}
```

**Status:** 🚧 Not yet implemented (requires frontend integration)

## ⚠️ Common Pitfalls

### 1. Attempting Server-Side Signing of Embedded Wallets

**❌ This will fail:**
```typescript
// Create embedded wallet
const wallet = await createStellarWallet(privy, { userId: 'did:privy:...' });

// Try to sign server-side
const signature = await privy.wallets().rawSign(wallet.id, {
  params: { hash: '0x...' }
});
// Error: "No valid user session keys available"
```

**Why it fails:**
- Embedded wallets require active user authentication
- Your server doesn't have the user's session
- Privy's security model prevents server-side access to user keys

### 2. Not Understanding the Owner Property

When you create an embedded wallet, the API response may not include an `owner` property:

```typescript
const wallet = await createStellarWallet(privy, { userId: 'did:privy:...' });
console.log(wallet.owner); // May be undefined!
```

**Important:** This doesn't mean the wallet isn't linked! The linkage exists in Privy's backend. You can verify in the Privy Dashboard under the user's account.

### 3. Using the Wrong Pattern for Production

**❌ Don't use standalone wallets for user operations:**
```typescript
// Bad: Users don't control this wallet
const wallet = await createStellarWallet(privy); // No userId
// Now you have full control, but the user doesn't!
```

**✅ Use embedded wallets for user operations:**
```typescript
// Good: User controls this wallet through Privy auth
const wallet = await createStellarWallet(privy, { userId: user.privyId });
// User must authenticate to sign with it
```

## 🔒 Security Implications

### Standalone Wallets

**Security model:**
- Your backend holds full signing power
- Whoever has `PRIVY_APP_ID` + `PRIVY_APP_SECRET` can sign
- Suitable for system operations you fully control
- Not suitable for user funds/assets

**Risks:**
- ⚠️ Credential leakage = full wallet compromise
- ⚠️ No user consent for transactions
- ⚠️ Backend breach = all wallets compromised

**Mitigation:**
- Secure credential storage (secrets manager, not .env in production)
- Limit use to system operations only
- Regular credential rotation
- Monitor all signing operations

### Embedded Wallets

**Security model:**
- User authentication required for signing
- Privy manages the authentication layer
- User has control over their wallet
- Suitable for user-owned assets

**Benefits:**
- ✅ User consent required for each signature
- ✅ Backend breach doesn't expose user keys
- ✅ Privy's security infrastructure protects keys
- ✅ User can recover wallet via Privy

**Considerations:**
- Requires frontend implementation
- Depends on Privy's authentication infrastructure
- User experience considerations (auth flow)

## 📖 Code Examples in This Repository

### Examples that use Standalone Wallets (Server-Side Signing)

1. **`test/privy.example.ts`**
   - Creates standalone wallet
   - ✅ Signs test data server-side (lines 59-73)
   - Use for: Learning, testing

2. **`test/canton-party-from-privy-wallet.example.ts`** (no userId)
   - Creates standalone wallet
   - ✅ Signs Canton topology hash server-side (lines 360-384)
   - Use for: Testing Canton integration

### Examples that use Embedded Wallets (No Server-Side Signing)

1. **`test/privy.add-stellar-wallet.example.ts`**
   - Creates embedded wallet for user
   - ❌ Does NOT attempt signing (would fail)
   - Lines 134-138: Documents that signing requires client-side SDK
   - Use for: Adding wallets to existing users

2. **`test/canton-party-from-privy-wallet.example.ts`** (with userId)
   - Creates embedded wallet for user
   - ❌ Signing will fail with "No valid user session keys"
   - Lines 385-400: Error handling explains why
   - Use for: Understanding the limitation

## 🎯 Recommendations

### For Development & Testing
- ✅ Use **standalone wallets**
- ✅ Sign server-side with test wallets
- ✅ Current implementation works perfectly

### For Production with Real Users
- ✅ Use **embedded wallets** linked to user accounts
- ✅ Implement hybrid backend/frontend flow
- ✅ Backend: Create wallet, generate topology, allocate party
- ✅ Frontend: User authentication, signing with Privy SDK
- ⚠️ **Do not** use standalone wallets for user funds

### Migration Path
1. Test and validate with standalone wallets (✅ Current state)
2. Implement frontend Privy SDK integration
3. Create backend API endpoints for the hybrid flow
4. Migrate to embedded wallets for production users

## 📚 Additional Resources

- **Privy Documentation**: https://docs.privy.io/
- **Privy React SDK**: https://docs.privy.io/guide/react
- **Canton Network SDK**: `@canton-network/wallet-sdk`
- **Our Privy Utils**: `src/utils/privy/README.md`

## 🔍 Quick Reference

**How do I know which wallet type I have?**
```typescript
// Created with userId = embedded wallet (client-side signing only)
const embedded = await createStellarWallet(privy, { userId: 'did:privy:...' });

// Created without userId = standalone wallet (server-side signing OK)
const standalone = await createStellarWallet(privy);
```

**Can I convert between types?**
- ❌ No, once created, the wallet type is fixed
- You must create a new wallet if you need a different type

**What should I use for my Canton party allocation?**
- Development/Testing: Standalone wallets (current approach)
- Production: Embedded wallets with frontend signing (future work)

---

**Last Updated**: Based on Canton + Privy integration work (November 2025)
