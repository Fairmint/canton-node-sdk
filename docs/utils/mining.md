---
layout: default
title: Mining Utilities - Canton Node SDK
sdk_version: 0.0.1
---

# Mining Utilities

Functions for mining operations, round management, and mining-related data processing.

## Functions

### mining-rounds

Gets the domain ID from the current mining round context.
This is useful for operations that need to automatically determine the domain ID.

**Parameters:** `validatorClient: ValidatorApiClient`

**Returns:** `Promise<string>`

**Exports:** `getCurrentMiningRoundContext`, `getCurrentMiningRoundDomainId`

**Example:**
```typescript
import { getCurrentMiningRoundContext } from '@fairmint/canton-node-sdk';

// TODO: Add example usage
```

---

_Generated from [https://github.com/Fairmint/canton-node-sdk](https://github.com/Fairmint/canton-node-sdk) v0.0.1_

[← Back to Utils Overview](/utils/)
