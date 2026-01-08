# Canton Node SDK - Examples

Examples demonstrating common workflows with the Canton Node SDK.

## Prerequisites

- cn-quickstart running
  - Clone: `https://github.com/digital-asset/cn-quickstart`
  - Start: `cd quickstart && make start`
- SDK dependencies: `npm install`

## Examples

### `canton-quickstart.ts` - Unified Client

Demonstrates the `Canton` class which provides a unified entry point for all API clients:

```bash
npx tsx examples/canton-quickstart.ts
```

- Initializes all clients with shared configuration
- Shows how to use ledger, validator, and scan APIs
- Demonstrates dynamic party ID updates

### `localnet-quickstart.ts` - LocalNet Authentication

Shows how JWT authentication works with localnet:

```bash
npx tsx examples/localnet-quickstart.ts
```

- Automatic JWT token generation (unsafe-auth mode)
- Bearer token injection in requests
- Simple configuration with built-in defaults

### `create-party.ts` - Create and Fund a Party

Creates a new party with funding and transfer preapproval:

```bash
npx tsx examples/create-party.ts [party-name] [amount]
npx tsx examples/create-party.ts alice 100
```

- Creates user via Validator API
- Funds party via transfer offer
- Creates transfer preapproval contract

### `transfer-amulets.ts` - Transfer via Offer

Demonstrates the transfer offer workflow:

```bash
npx tsx examples/transfer-amulets.ts <receiver-party-id> [amount]
npx tsx examples/transfer-amulets.ts alice::12345... 10
```

- Creates a transfer offer
- Accepts the offer as receiver
- Shows the two-step transfer flow

### `external-signing.ts` - User-Controlled Keys

Shows how to create parties with externally-managed keys:

```bash
npx tsx examples/external-signing.ts
```

- Generates Ed25519 keypair
- Creates external party on ledger
- Demonstrates the external signing flow

### `scan-traffic-status.ts` - Network Monitoring

Shows how to monitor network traffic:

```bash
npx tsx examples/scan-traffic-status.ts
```

## Quick Reference

### Using the Canton Class

```typescript
import { Canton } from '@fairmint/canton-node-sdk';

const canton = new Canton({ network: 'localnet' });

// Access clients
const version = await canton.ledger.getVersion();
const balance = await canton.validator.getWalletBalance();
const health = await canton.scan.getHealthStatus();
```

### Creating a Party

```typescript
import { Canton, createParty } from '@fairmint/canton-node-sdk';

const canton = new Canton({ network: 'localnet' });

const { partyId, preapprovalContractId } = await createParty({
  ledgerClient: canton.ledger,
  validatorClient: canton.validator,
  partyName: 'alice',
  amount: '100',
});
```

### Transferring Amulets

```typescript
import { Canton, createTransferOffer, acceptTransferOffer } from '@fairmint/canton-node-sdk';

const canton = new Canton({ network: 'localnet' });

// Create offer
const offerId = await createTransferOffer({
  ledgerClient: canton.ledger,
  receiverPartyId: 'bob::123...',
  amount: '50',
  description: 'Payment',
});

// Accept offer
await acceptTransferOffer({
  ledgerClient: canton.ledger,
  transferOfferContractId: offerId,
  acceptingPartyId: 'bob::123...',
});
```

### External Signing

```typescript
import { Keypair } from '@stellar/stellar-base';
import { Canton, createExternalParty } from '@fairmint/canton-node-sdk';

const canton = new Canton({ network: 'localnet' });
const keypair = Keypair.random();

const { partyId } = await createExternalParty({
  ledgerClient: canton.ledger,
  keypair,
  partyName: 'external-alice',
  synchronizerId: 'global-synchronizer::...',
});
```

## More Resources

- [SDK Documentation](https://sdk.canton.fairmint.com/)
- [External Signing Guide](../docs/EXTERNAL_SIGNING.md)
- [Integration Tests](../test/integration/) - More complex examples
