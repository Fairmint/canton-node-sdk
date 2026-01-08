---
layout: default
title: Traffic Utilities - Canton Node SDK
sdk_version: 0.0.1
---

# Traffic Utilities

Functions for working with traffic costs and consumption on Canton networks.

Traffic refers to the data throughput required to process transactions. Transactions consume traffic based
on their size and complexity. These utilities help you:

- Estimate traffic costs before submitting transactions
- Check current traffic status for a party/participant

## Functions

### getEstimatedTrafficCost

Extracts traffic cost estimation from a prepared transaction response.

When preparing transactions for external signing via `interactiveSubmissionPrepare`, the response includes
cost estimation data that tells you how much traffic (in bytes) the transaction will consume.

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
  console.log(`Request cost: ${cost.requestCost} bytes`);
  console.log(`Response cost: ${cost.responseCost} bytes`);
  console.log(`Total cost: ${cost.totalCost} bytes`);
}
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
  /** Estimated traffic cost of the confirmation request. */
  requestCost: number;
  /** Estimated traffic cost of the confirmation response. */
  responseCost: number;
  /** Total estimated traffic cost (request + response). */
  totalCost: number;
  /** Timestamp when estimation was made (ISO 8601). */
  estimatedAt?: string;
}
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
