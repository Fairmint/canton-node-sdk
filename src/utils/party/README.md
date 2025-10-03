# Party Utilities

This module provides utilities for creating and managing parties on Canton networks.

## createParty

Creates a party on the specified network with optional funding.

### Usage

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
  partyName: 'alice123',
  amount: '100',
});
```

### Parameters

- `ledgerClient`: Ledger JSON API client instance
- `validatorClient`: Validator API client instance
- `partyName`: Party name to use for creation
- `amount`: Amount to fund the party with (use '0' for no funding)

### Returns

- `partyId`: Party ID from the Validator API
- `preapprovalContractId`: Preapproval contract ID for transfers (if funding > 0)

### Features

- Creates user via Validator API
- Optionally funds the party with amulets
- Creates transfer preapproval for the new party
- Returns clean, minimal result structure
- No actual database interactions (simulated for testing/development)

### Environment Variables Required

The following environment variables must be set for the specified network and provider:

- `CANTON_{NETWORK}_{PROVIDER}_LEDGER_JSON_API_URI`
- `CANTON_{NETWORK}_{PROVIDER}_LEDGER_JSON_API_CLIENT_ID`
- `CANTON_{NETWORK}_{PROVIDER}_LEDGER_JSON_API_CLIENT_SECRET` (or username/password)
- `CANTON_{NETWORK}_{PROVIDER}_VALIDATOR_API_URI`
- `CANTON_{NETWORK}_{PROVIDER}_VALIDATOR_API_CLIENT_ID`
- `CANTON_{NETWORK}_{PROVIDER}_VALIDATOR_API_CLIENT_SECRET` (or username/password)
- `CANTON_WALLET_TEMPLATE_ID_{NETWORK}`
- `CANTON_VALIDATOR_WALLET_APP_INSTALL_CONTRACT_ID_{NETWORK}`
