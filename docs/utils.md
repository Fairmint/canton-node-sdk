---
layout: default
title: Utility Functions - Canton Node SDK
sdk_version: 0.0.1
---

# Utility Functions

The Canton Node SDK provides a comprehensive set of utility functions to simplify common blockchain operations.

## Categories

- **[Amulet Utilities](/utils/amulet/)** - 4 functions
- **[Contracts Utilities](/utils/contracts/)** - 2 functions
- **[Mining Utilities](/utils/mining/)** - 1 function
- **[Parsers Utilities](/utils/parsers/)** - 1 function
- **[Party Utilities](/utils/party/)** - 1 function

## Overview

This documentation covers all utility functions available in the SDK, organized by category:

- **Amulet Utilities** - Functions for working with Amulet tokens and transfers
- **Contract Utilities** - Tools for contract monitoring and management
- **Mining Utilities** - Functions for mining operations and round management
- **Party Utilities** - Tools for party creation and management
- **Parser Utilities** - Functions for parsing and analyzing blockchain data

## Quick Examples

### Creating a Party

```typescript
import { createParty } from '@fairmint/canton-node-sdk';
import { LedgerJsonApiClient } from '@fairmint/canton-node-sdk';
import { ValidatorApiClient } from '@fairmint/canton-node-sdk';

// Initialize your clients
const ledgerClient = new LedgerJsonApiClient(/* your config */);
const validatorClient = new ValidatorApiClient(/* your config */);

const result = await createParty({
  ledgerClient,
  validatorClient,
  partyName: 'Alice',
  amount: '100.0',
});

console.log(`Party created with ID: ${result.partyId}`);
```

### Creating Transfer Offers

```typescript
import { createTransferOffer } from '@fairmint/canton-node-sdk';

const offerId = await createTransferOffer({
  ledgerClient,
  receiverPartyId: 'Bob::1221',
  amount: '50.0',
  description: 'Payment for services',
});
```

### Parsing Fees

```typescript
import { parseFeesFromEventTree } from '@fairmint/canton-node-sdk';

const feeAnalysis = parseFeesFromEventTree(eventTree);
console.log(`Total fees: ${feeAnalysis.totalFees}`);
```

---

_Generated from [https://github.com/Fairmint/canton-node-sdk](https://github.com/Fairmint/canton-node-sdk) v0.0.1_
