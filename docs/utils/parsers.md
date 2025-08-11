---
layout: default
title: Parsers Utilities - Canton Node SDK
sdk_version: 0.0.1
---

# Parsers Utilities

Functions for parsing and analyzing blockchain data, including fee analysis and data extraction.

## Functions

### fee-parser

Validates that all fee components are present and non-negative

**Parameters:** `feeAnalysis: FeeAnalysis`

**Returns:** `string[]`

**Exports:** `parseFeesFromEventTree`, `parseFeesFromUpdate`, `formatFeeAmount`, `validateFeeAnalysis`

**Example:**
```typescript
import { parseFeesFromEventTree } from '@fairmint/canton-node-sdk';

// TODO: Add example usage
```

---

_Generated from [https://github.com/Fairmint/canton-node-sdk](https://github.com/Fairmint/canton-node-sdk) v0.0.1_

[← Back to Utils Overview](/utils/)
