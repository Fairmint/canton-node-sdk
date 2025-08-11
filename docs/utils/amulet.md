---
layout: default
title: Amulet Utilities - Canton Node SDK
sdk_version: 0.0.1
---

# Amulet Utilities

Functions for working with Amulet tokens, including transfer offers, pre-approvals, and token management.

## Functions

### get-amulets-for-transfer

Gets unlocked amulets owned by the sender party that can be used for transfers

**Parameters:** `params: GetAmuletsForTransferParams`

**Returns:** `Promise<AmuletForTransfer[]>`

**Exports:** `getAmuletsForTransfer`

**Example:**
```typescript
import { getAmuletsForTransfer } from '@fairmint/canton-node-sdk';

// TODO: Add example usage
```

### offers

Accepts a transfer offer using TransferOffer_Accept

**Parameters:** `params: AcceptTransferOfferParams`

**Returns:** `Promise<void>`

**Exports:** `createTransferOffer`, `acceptTransferOffer`

**Example:**
```typescript
import { createTransferOffer } from '@fairmint/canton-node-sdk';

// TODO: Add example usage
```

### pre-approve-transfers

Creates a TransferPreapproval contract to enable pre-approved transfers for a party

**Parameters:** `ledgerClient: LedgerJsonApiClient, validatorClient: ValidatorApiClient, params: PreApproveTransfersParams`

**Returns:** `Promise<PreApproveTransfersResult>`

**Exports:** `preApproveTransfers`

**Example:**
```typescript
import { preApproveTransfers } from '@fairmint/canton-node-sdk';

// TODO: Add example usage
```

### transfer-to-preapproved

Transfers coins to a party that has pre-approved transfers enabled

**Parameters:** `ledgerClient: LedgerJsonApiClient, validatorClient: ValidatorApiClient, params: TransferToPreapprovedParams`

**Returns:** `Promise<TransferToPreapprovedResult>`

**Exports:** `transferToPreapproved`

**Example:**
```typescript
import { transferToPreapproved } from '@fairmint/canton-node-sdk';

// TODO: Add example usage
```

---

_Generated from [https://github.com/Fairmint/canton-node-sdk](https://github.com/Fairmint/canton-node-sdk) v0.0.1_

[← Back to Utils Overview](/utils/)
