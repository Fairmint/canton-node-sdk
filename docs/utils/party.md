---
layout: default
title: Party Utilities - Canton Node SDK
sdk_version: 0.0.1
---

# Party Utilities

Utilities for party creation, management, and party-related operations.

## Functions

### createParty

Creates a party, optionally funds the wallet and if funded it then creates a preapproval contract for the party.

**Parameters:** `CreatePartyOptions`

- `ledgerClient` - Ledger JSON API client instance
- `validatorClient` - Validator API client instance  
- `partyName` - Party name to use for creation. This becomes the prefix on the party ID.
- `amount` - Amount to fund the party with. Must be > 0 to create a preapproval contract

**Returns:** `Promise<PartyCreationResult>`

- `partyId` - Party ID from the Validator API
- `preapprovalContractId` - Preapproval contract ID for transfers (only present if funded)

**Example:**
```typescript
import { createParty } from '@fairmint/canton-node-sdk';
import { LedgerJsonApiClient, ValidatorApiClient } from '@fairmint/canton-node-sdk';

async function createNewParty() {
  const ledgerClient = new LedgerJsonApiClient();
  const validatorClient = new ValidatorApiClient();

  const result = await createParty({
    ledgerClient,
    validatorClient,
    partyName: 'alice',
    amount: '100.0'
  });

  console.log(`Party created successfully! ID: ${result.partyId}, Preapproval: ${result.preapprovalContractId}`);
  
  return result;
}
```

---

_Generated from [https://github.com/Fairmint/canton-node-sdk](https://github.com/Fairmint/canton-node-sdk) v0.0.1_

[← Back to Utils Overview](/utils/)
