---
layout: default
title: Traffic Utilities - Canton Node SDK
sdk_version: 0.0.1
---

# Traffic Utilities

Functions for working with traffic costs and consumption on Canton networks.

Traffic refers to the data throughput required to process transactions. Transactions consume traffic based
on their size and complexity. These utilities help you:

- Estimate traffic costs before submitting transactions (including dollar cost)
- Check current traffic status for a party/participant

## Pricing

Traffic is billed at **$60 per MB** (6000 cents/MB). The SDK automatically calculates the dollar cost
based on the traffic estimate plus a ~5KB overhead for update confirmation.

## Functions

### estimateTrafficCost

Estimates the traffic cost for a set of commands without executing them.

This is the easiest way to get a traffic cost estimate. It prepares a transaction internally and extracts
the cost estimation, so you don't need to handle the preparation step yourself.

**Parameters:**
- `options.ledgerClient: LedgerJsonApiClient` - Ledger JSON API client instance
- `options.commands: Command[]` - Commands to estimate traffic cost for
- `options.synchronizerId: string` - Synchronizer/domain ID where the transaction will be submitted
- `options.actAs?: string[]` - Parties to act as (defaults to client's configured party)
- `options.readAs?: string[]` - Parties to read as (optional)
- `options.userId?: string` - User ID (defaults to client's configured user)
- `options.disclosedContracts?: DisclosedContract[]` - Disclosed contracts (optional)
- `options.packageIdSelectionPreference?: PackagePreference[]` - Package preferences (optional)

**Returns:** `Promise<TrafficCostEstimate | undefined>` - The traffic cost estimate, or undefined if not available

**Example:**
```typescript
import { Canton, estimateTrafficCost } from '@fairmint/canton-node-sdk';

const canton = new Canton({ network: 'localnet' });

// Estimate the cost of creating a contract
const estimate = await estimateTrafficCost({
  ledgerClient: canton.ledger,
  commands: [
    {
      CreateCommand: {
        templateId: 'MyModule:MyTemplate',
        createArguments: { fields: { owner: { party: 'alice::...' } } },
      },
    },
  ],
  synchronizerId: 'global-domain::1234...',
});

if (estimate) {
  console.log(`Traffic: ${estimate.totalCostWithOverhead} bytes`);
  console.log(`Cost: $${estimate.costInDollars.toFixed(2)}`);
}
```

---

### getEstimatedTrafficCost

Extracts traffic cost estimation from a prepared transaction response.

Use this when you already have a prepared transaction (e.g., from `prepareExternalTransaction`) and want
to extract the cost information. For a simpler API, use `estimateTrafficCost` instead.

**Parameters:**
- `preparedTransaction: InteractiveSubmissionPrepareResponse` - The response from `interactiveSubmissionPrepare`

**Returns:** `TrafficCostEstimate | undefined` - The traffic cost breakdown, or undefined if not available

**Example:**
```typescript
import {
  prepareExternalTransaction,
  getEstimatedTrafficCost,
} from '@fairmint/canton-node-sdk';

// Prepare a transaction
const prepared = await prepareExternalTransaction({
  ledgerClient,
  commands,
  userId,
  actAs,
  synchronizerId,
});

// Get the traffic cost estimate
const cost = getEstimatedTrafficCost(prepared);
if (cost) {
  console.log(`Traffic: ${cost.totalCostWithOverhead} bytes`);
  console.log(`Cost: $${cost.costInDollars.toFixed(2)}`);
}
```

---

### calculateTrafficCostInCents / calculateTrafficCostInDollars

Helper functions to calculate traffic cost from bytes.

**Example:**
```typescript
import {
  calculateTrafficCostInCents,
  calculateTrafficCostInDollars,
} from '@fairmint/canton-node-sdk';

// 55KB of traffic at $60/MB
const cents = calculateTrafficCostInCents(55 * 1024); // ~322 cents
const dollars = calculateTrafficCostInDollars(55 * 1024); // ~$3.22
```

---

### getTrafficStatus

Gets the current traffic status for a party/participant. Works with both ValidatorApiClient (authenticated)
and ScanApiClient (public).

**With ValidatorApiClient:**

Supports automatic domain and party resolution.

**Parameters:**
- `client: ValidatorApiClient`
- `options?: GetTrafficStatusOptions` - Optional domainId and memberId

**Example:**
```typescript
import { ValidatorApiClient, getTrafficStatus } from '@fairmint/canton-node-sdk';

const validatorClient = new ValidatorApiClient({ ... });

// Get traffic status for the configured party
const status = await getTrafficStatus(validatorClient);
console.log(`Consumed: ${status.consumed}`);
console.log(`Limit: ${status.limit}`);
console.log(`Purchased: ${status.purchased}`);

// Get traffic status for a specific member
const status = await getTrafficStatus(validatorClient, {
  domainId: 'global-domain::1234...',
  memberId: 'PAR::party-id::fingerprint',
});
```

**With ScanApiClient:**

Requires explicit domainId and partyId.

**Parameters:**
- `client: ScanApiClient`
- `options: { domainId: string; partyId: string; memberId?: string }` - Required domain and party IDs

**Example:**
```typescript
import { ScanApiClient, getTrafficStatus } from '@fairmint/canton-node-sdk';

const scanClient = new ScanApiClient({ network: 'mainnet' });

// Get traffic status for a specific party
const status = await getTrafficStatus(scanClient, {
  domainId: 'global-domain::1234...',
  partyId: 'party-id::fingerprint',
});
console.log(`Consumed: ${status.consumed}`);
console.log(`Purchased: ${status.purchased}`);
```

---

## Types

### TrafficCostEstimate

Traffic cost estimation breakdown for a transaction.

```typescript
interface TrafficCostEstimate {
  /** Estimated traffic cost of the confirmation request (bytes). */
  requestCost: number;
  /** Estimated traffic cost of the confirmation response (bytes). */
  responseCost: number;
  /** Total estimated traffic cost (request + response) in bytes. */
  totalCost: number;
  /** Total cost including update confirmation overhead (~5KB) in bytes. */
  totalCostWithOverhead: number;
  /** Estimated cost in cents (based on $60/MB pricing). */
  costInCents: number;
  /** Estimated cost in dollars (based on $60/MB pricing). */
  costInDollars: number;
  /** Timestamp when estimation was made (ISO 8601). */
  estimatedAt?: string;
}
```

### Constants

```typescript
/** Default overhead for update ID confirmation (~5KB). */
const UPDATE_CONFIRMATION_OVERHEAD_BYTES = 5 * 1024;

/** Default price per megabyte of traffic in cents ($60/MB = 6000 cents/MB). */
const DEFAULT_PRICE_PER_MB_CENTS = 6000;
```

### TrafficStatus

Current traffic status for a participant/member.

```typescript
interface TrafficStatus {
  /** Total traffic consumed on the synchronizer. */
  consumed: number;
  /** Current traffic limit. */
  limit: number;
  /** Total traffic purchased (may exceed limit while purchase is pending). */
  purchased: number;
}
```

---

_Generated from [https://github.com/Fairmint/canton-node-sdk](https://github.com/Fairmint/canton-node-sdk) v0.0.1_

[← Back to Utils Overview](/utils/)
