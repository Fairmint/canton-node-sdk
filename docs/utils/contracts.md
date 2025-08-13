---
layout: default
title: Contracts Utilities - Canton Node SDK
sdk_version: 0.0.1
---

# Contracts Utilities

Tools for contract monitoring, disclosure management, and contract lifecycle operations.

## Functions

### contract-monitor

Waits for a contract to be archived by periodically checking active contracts

**Parameters:** `ledgerJsonApiClient: LedgerJsonApiClient, contractId: string, options: WaitForContractArchivalOptions`

**Returns:** `Promise<void>`

**Exports:** `waitForContractToBeArchived`

**Example:**
```typescript
import { waitForContractToBeArchived } from '@fairmint/canton-node-sdk';

// TODO: Add example usage
```

---

_Generated from [https://github.com/Fairmint/canton-node-sdk](https://github.com/Fairmint/canton-node-sdk) v0.0.1_

[← Back to Utils Overview](/utils/)
